import type { AgentMode } from "@/common/types/mode";
import type { ThinkingLevel } from "@/common/types/thinking";
import assert from "@/common/utils/assert";

export interface SessionState {
  sessionId: string;
  workspaceId: string;
  projectPath: string;
  modeId: AgentMode;
  modelId: string;
  thinkingLevel: ThinkingLevel;
  activePromptAbort?: AbortController;
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
