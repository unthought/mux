import type * as schema from "@agentclientprotocol/sdk";
import type { RouterClient } from "@orpc/server";
import assert from "@/common/utils/assert";
import type { AppRouter } from "@/node/orpc/router";
import type { SessionState } from "../sessionState";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function contentBlockToText(block: schema.ContentBlock): string {
  switch (block.type) {
    case "text":
      return block.text;
    case "resource_link": {
      const title = block.title?.trim() || block.name;
      return `Referenced resource: ${title} (${block.uri})`;
    }
    case "resource": {
      const resource = block.resource;
      if ("text" in resource && typeof resource.text === "string") {
        return resource.text;
      }
      return `Embedded resource: ${resource.uri}`;
    }
    case "image":
      return "[Image input omitted: mux ACP bridge currently forwards text context only]";
    case "audio":
      return "[Audio input omitted: mux ACP bridge currently forwards text context only]";
    default:
      return stringifyUnknown(block);
  }
}

export function extractPromptText(promptBlocks: Array<schema.ContentBlock>): string {
  const lines = promptBlocks
    .map(contentBlockToText)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  assert(lines.length > 0, "ACP prompt must include at least one non-empty content block");
  return lines.join("\n\n");
}

function formatSendMessageError(error: unknown): string {
  if (!isRecord(error)) {
    return String(error);
  }

  const errorType = typeof error.type === "string" ? error.type : "unknown";

  if (typeof error.message === "string" && error.message.trim().length > 0) {
    return `${errorType}: ${error.message}`;
  }

  if (typeof error.raw === "string" && error.raw.trim().length > 0) {
    return `${errorType}: ${error.raw}`;
  }

  if (typeof error.provider === "string" && error.provider.trim().length > 0) {
    return `${errorType}: ${error.provider}`;
  }

  return errorType;
}

export async function sendPromptToWorkspace(
  client: RouterClient<AppRouter>,
  session: SessionState,
  params: schema.PromptRequest
): Promise<void> {
  const userMessage = extractPromptText(params.prompt);

  const sendResult = await client.workspace.sendMessage({
    workspaceId: session.workspaceId,
    message: userMessage,
    options: {
      model: session.modelId,
      thinkingLevel: session.thinkingLevel,
      agentId: session.modeId,
      mode: session.modeId,
    },
  });

  if (!sendResult.success) {
    throw new Error(`workspace.sendMessage failed: ${formatSendMessageError(sendResult.error)}`);
  }
}
