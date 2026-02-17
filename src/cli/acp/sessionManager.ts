import type * as acpSchema from "@agentclientprotocol/sdk";
import type { ThinkingLevel } from "@/common/types/thinking";
import assert from "@/common/utils/assert";

export interface PromptResolver {
  resolve: (result: acpSchema.PromptResponse) => void;
  reject: (error: Error) => void;
  messageId: string;
}

export interface SessionState {
  workspaceId: string;
  projectPath: string;
  agentId: string;
  model: string;
  thinkingLevel: ThinkingLevel;
  /** Active onChat subscription abort controller */
  abortController: AbortController;
  /** Resolves when the current prompt completes */
  promptResolver?: PromptResolver;
  /** Whether we've seen caught-up (initial replay is done) */
  caughtUp: boolean;
  /** Whether the first prompt has been sent (for name generation) */
  firstPromptSent: boolean;
}

interface SessionStateInit {
  workspaceId: string;
  projectPath: string;
  agentId: string;
  model: string;
  thinkingLevel: ThinkingLevel;
}

export class SessionManager {
  private sessions = new Map<string, SessionState>();

  getSession(sessionId: string): SessionState | undefined {
    assert(sessionId.length > 0, "sessionId must be non-empty");
    return this.sessions.get(sessionId);
  }

  createSession(sessionId: string, state: SessionStateInit): SessionState {
    assert(sessionId.length > 0, "sessionId must be non-empty");
    assert(state.workspaceId.length > 0, "workspaceId must be non-empty");
    assert(state.projectPath.length > 0, "projectPath must be non-empty");
    assert(state.agentId.length > 0, "agentId must be non-empty");
    assert(state.model.length > 0, "model must be non-empty");

    this.removeSession(sessionId);

    const nextState: SessionState = {
      ...state,
      abortController: new AbortController(),
      caughtUp: false,
      firstPromptSent: false,
    };

    this.sessions.set(sessionId, nextState);
    return nextState;
  }

  removeSession(sessionId: string): void {
    assert(sessionId.length > 0, "sessionId must be non-empty");

    const existing = this.sessions.get(sessionId);
    if (!existing) {
      return;
    }

    existing.abortController.abort();

    if (existing.promptResolver) {
      existing.promptResolver.reject(new Error(`Session ${sessionId} was disposed`));
      existing.promptResolver = undefined;
    }

    this.sessions.delete(sessionId);
  }

  /** Set the prompt resolver for a session (called before sendMessage) */
  setPromptResolver(sessionId: string, resolver: SessionState["promptResolver"]): void {
    assert(sessionId.length > 0, "sessionId must be non-empty");
    assert(resolver != null, "prompt resolver is required");

    const session = this.sessions.get(sessionId);
    assert(session, `Cannot set prompt resolver for unknown session ${sessionId}`);
    assert(
      session.promptResolver == null,
      `Session ${sessionId} already has an active prompt resolver`
    );

    session.promptResolver = resolver;
  }

  /** Clear the prompt resolver */
  clearPromptResolver(sessionId: string): void {
    assert(sessionId.length > 0, "sessionId must be non-empty");

    const session = this.sessions.get(sessionId);
    if (!session) {
      return;
    }

    session.promptResolver = undefined;
  }

  updatePromptMessageId(sessionId: string, messageId: string): void {
    assert(sessionId.length > 0, "sessionId must be non-empty");
    assert(messageId.length > 0, "messageId must be non-empty");

    const session = this.sessions.get(sessionId);
    if (!session?.promptResolver) {
      return;
    }

    session.promptResolver.messageId = messageId;
  }

  /** Update config for a session */
  updateConfig(
    sessionId: string,
    updates: Partial<Pick<SessionState, "agentId" | "model" | "thinkingLevel">>
  ): void {
    assert(sessionId.length > 0, "sessionId must be non-empty");
    assert(updates != null, "updates are required");

    const session = this.sessions.get(sessionId);
    assert(session, `Cannot update unknown session ${sessionId}`);

    if (updates.agentId != null) {
      assert(updates.agentId.length > 0, "agentId update must be non-empty");
      session.agentId = updates.agentId;
    }

    if (updates.model != null) {
      assert(updates.model.length > 0, "model update must be non-empty");
      session.model = updates.model;
    }

    if (updates.thinkingLevel != null) {
      session.thinkingLevel = updates.thinkingLevel;
    }
  }

  disposeAll(): void {
    for (const sessionId of this.sessions.keys()) {
      this.removeSession(sessionId);
    }
  }
}
