import type { AgentSideConnection } from "@agentclientprotocol/sdk";
import type * as schema from "@agentclientprotocol/sdk";
import type { RouterClient } from "@orpc/server";
import { isCaughtUpMessage } from "@/common/orpc/types";
import type { AppRouter } from "@/node/orpc/router";
import {
  createUpdateMappingState,
  mapWorkspaceChatEventToAcp,
} from "./mappers/updates";
import type { SessionState } from "./sessionState";

interface PumpOnChatToAcpUpdatesOptions {
  client: RouterClient<AppRouter>;
  conn: AgentSideConnection;
  session: SessionState;
  unstableEnabled: boolean;
  signal: AbortSignal;
  onReady: () => Promise<void>;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.message.toLowerCase().includes("abort");
  }

  return false;
}

export async function pumpOnChatToAcpUpdates(
  opts: PumpOnChatToAcpUpdatesOptions
): Promise<{ stopReason: schema.StopReason }> {
  const mappingState = createUpdateMappingState();

  try {
    const iterator = await opts.client.workspace.onChat(
      { workspaceId: opts.session.workspaceId },
      { signal: opts.signal }
    );

    let replayFinished = false;
    let promptDispatched = false;

    for await (const event of iterator) {
      if (opts.signal.aborted) {
        return { stopReason: "cancelled" };
      }

      if (!replayFinished) {
        if (!isCaughtUpMessage(event)) {
          continue;
        }

        replayFinished = true;
        await opts.onReady();
        promptDispatched = true;
        continue;
      }

      const mappedEvent = mapWorkspaceChatEventToAcp(event, mappingState, opts.unstableEnabled);

      if (mappedEvent.kind === "ignore") {
        continue;
      }

      if (mappedEvent.kind === "error") {
        throw mappedEvent.error;
      }

      if (mappedEvent.kind === "stop") {
        return { stopReason: mappedEvent.stopReason };
      }

      await opts.conn.sessionUpdate({
        sessionId: opts.session.sessionId,
        update: mappedEvent.update,
      });
    }

    if (opts.signal.aborted) {
      return { stopReason: "cancelled" };
    }

    if (!replayFinished) {
      throw new Error("workspace.onChat ended before replay completed");
    }

    if (!promptDispatched) {
      throw new Error("workspace.onChat ended before prompt dispatch");
    }

    throw new Error("workspace.onChat ended before the prompt turn completed");
  } catch (error) {
    if (opts.signal.aborted || isAbortError(error)) {
      return { stopReason: "cancelled" };
    }

    throw error;
  }
}
