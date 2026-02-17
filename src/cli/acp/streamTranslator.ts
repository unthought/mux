import type * as acpSchema from "@agentclientprotocol/sdk";
import type { z } from "zod";
import assert from "@/common/utils/assert";
import type { WorkspaceChatMessageSchema } from "@/common/orpc/schemas/stream";

type WorkspaceChatMessage = z.infer<typeof WorkspaceChatMessageSchema>;
type AcpSessionUpdate = acpSchema.SessionUpdate;

interface MuxUsageLike {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  promptTokens?: number;
  completionTokens?: number;
  reasoningTokens?: number;
  cachedInputTokens?: number;
}

/**
 * Convert Mux usage payloads into ACP Usage.
 *
 * Mux currently emits AI SDK usage keys (`inputTokens`, `outputTokens`) but we
 * also accept legacy key names for defensive compatibility.
 */
export function translateUsage(muxUsage: MuxUsageLike): acpSchema.Usage {
  assert(muxUsage != null, "translateUsage requires a usage object");

  const inputTokens = normalizeTokenCount(muxUsage.inputTokens ?? muxUsage.promptTokens);
  const outputTokens = normalizeTokenCount(muxUsage.outputTokens ?? muxUsage.completionTokens);
  const computedTotal = inputTokens + outputTokens;
  const totalTokens = normalizeTokenCount(muxUsage.totalTokens ?? computedTotal);

  const translated: acpSchema.Usage = {
    inputTokens,
    outputTokens,
    totalTokens,
  };

  const thoughtTokens = normalizeOptionalTokenCount(muxUsage.reasoningTokens);
  if (thoughtTokens != null) {
    translated.thoughtTokens = thoughtTokens;
  }

  const cachedReadTokens = normalizeOptionalTokenCount(muxUsage.cachedInputTokens);
  if (cachedReadTokens != null) {
    translated.cachedReadTokens = cachedReadTokens;
  }

  return translated;
}

/**
 * Translates a single Mux workspace chat event into zero or more ACP SessionUpdate objects.
 * Returns an empty array if the event has no ACP representation.
 */
export function translateMuxEvent(event: WorkspaceChatMessage): AcpSessionUpdate[] {
  assert(event != null, "translateMuxEvent requires an event");

  switch (event.type) {
    case "stream-delta":
      return toChunkUpdate("agent_message_chunk", event.delta);

    case "reasoning-delta":
      return toChunkUpdate("agent_thought_chunk", event.delta);

    case "tool-call-start":
      return [
        {
          sessionUpdate: "tool_call",
          toolCallId: event.toolCallId,
          title: event.toolName,
          rawInput: event.args,
          status: "in_progress",
        },
      ];

    case "tool-call-delta": {
      const deltaText = normalizeText(event.delta);
      if (deltaText.length === 0) {
        return [];
      }

      return [
        {
          sessionUpdate: "tool_call_update",
          toolCallId: event.toolCallId,
          content: [
            {
              type: "content",
              content: {
                type: "text",
                text: deltaText,
              },
            },
          ],
        },
      ];
    }

    case "tool-call-end":
      return [
        {
          sessionUpdate: "tool_call_update",
          toolCallId: event.toolCallId,
          status: "completed",
          rawOutput: event.result,
        },
      ];

    case "usage-delta": {
      const usage = translateUsage(event.cumulativeUsage);
      return [
        {
          sessionUpdate: "usage_update",
          size: usage.totalTokens,
          used: usage.totalTokens,
        },
      ];
    }

    case "message":
      return translateReplayMessage(event);

    case "stream-error":
      // stream-error is handled at the prompt level (rejects the prompt promise)
      return [];

    case "reasoning-end":
    case "caught-up":
    case "heartbeat":
    case "stream-start":
    case "stream-end":
    case "stream-abort":
    case "bash-output":
    case "task-created":
    case "delete":
    case "error":
    case "session-usage-delta":
    case "queued-message-changed":
    case "restore-to-input":
    case "idle-compaction-needed":
    case "runtime-status":
    case "init-start":
    case "init-output":
    case "init-end":
      return [];

    default:
      return [];
  }
}

function translateReplayMessage(
  event: Extract<WorkspaceChatMessage, { type: "message" }>
): AcpSessionUpdate[] {
  const text = extractReplayText(event);
  if (text.length === 0) {
    return [];
  }

  if (event.role === "user") {
    return toChunkUpdate("user_message_chunk", text);
  }

  if (event.role === "assistant") {
    return toChunkUpdate("agent_message_chunk", text);
  }

  return [];
}

function extractReplayText(event: Extract<WorkspaceChatMessage, { type: "message" }>): string {
  const textParts = event.parts
    .flatMap((part) => {
      if (part.type === "text") {
        return [part.text];
      }
      if (part.type === "reasoning") {
        return [part.text];
      }
      return [];
    })
    .map((text) => text.trim())
    .filter((text) => text.length > 0);

  if (textParts.length > 0) {
    return textParts.join("\n\n");
  }

  const legacyContent = (event as unknown as { content?: unknown }).content;
  if (typeof legacyContent === "string") {
    return legacyContent.trim();
  }

  return "";
}

function normalizeTokenCount(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.floor(value);
}

function normalizeOptionalTokenCount(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    return undefined;
  }
  return Math.floor(value);
}

function normalizeText(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function toChunkUpdate(
  sessionUpdate: "user_message_chunk" | "agent_message_chunk" | "agent_thought_chunk",
  text: string
): AcpSessionUpdate[] {
  const normalized = text.trim().length > 0 ? text : "";
  if (normalized.length === 0) {
    return [];
  }

  return [
    {
      sessionUpdate,
      content: {
        type: "text",
        text: normalized,
      },
    },
  ];
}
