import type { AgentMode } from "@/common/types/mode";
import type { ThinkingLevel } from "@/common/types/thinking";
import type { z } from "zod";
import type { WorkspaceAISettingsSchema } from "@/common/orpc/schemas/workspaceAiSettings";
import assert from "@/common/utils/assert";

export type WorkspaceAISettings = z.infer<typeof WorkspaceAISettingsSchema>;

export interface SessionState {
  sessionId: string;
  workspaceId: string;
  projectPath: string;
  /** Named worktree path (e.g., ~/.mux/src/project/branch). Accepted as an
   *  alternative cwd alongside projectPath for ownership checks. */
  namedWorkspacePath: string;
  modeId: AgentMode;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  activePromptAbort?: AbortController;

  /**
   * Workspace-level base AI defaults (from `metadata.aiSettings`) resolved at session
   * creation time. Used as fallback in `applyPerModeAiDefaults` when no per-mode
   * override exists in `aiSettingsByAgent`, so mode switches restore the user's
   * configured baseline rather than hard-coded defaults.
   */
  defaultModelId: string;
  defaultThinkingLevel: ThinkingLevel;

  /**
   * Snapshot of per-agent AI settings from workspace metadata at session creation time.
   * Used to restore per-mode defaults when switching modes without an extra API call.
   */
  aiSettingsByAgent?: Readonly<Record<string, WorkspaceAISettings>>;
}

export class SessionStateMap {
  private readonly states = new Map<string, SessionState>();

  get(sessionId: string): SessionState | undefined {
    return this.states.get(sessionId);
  }

  set(sessionId: string, state: SessionState): void {
    assert(sessionId.trim().length > 0, "sessionId must be non-empty");
    assert(state.sessionId.trim().length > 0, "state.sessionId must be non-empty");
    assert(state.workspaceId.trim().length > 0, "state.workspaceId must be non-empty");
    assert(state.projectPath.trim().length > 0, "state.projectPath must be non-empty");
    assert(
      sessionId === state.sessionId,
      `SessionStateMap.set key mismatch: expected ${sessionId}, received ${state.sessionId}`
    );

    this.states.set(sessionId, state);
  }

  delete(sessionId: string): void {
    this.states.delete(sessionId);
  }

  require(sessionId: string): SessionState {
    const state = this.states.get(sessionId);
    assert(state, `ACP session not found: ${sessionId}`);
    return state;
  }

  values(): Iterable<SessionState> {
    return this.states.values();
  }
}
