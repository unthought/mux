import { describe, expect, it } from "bun:test";
import type { SessionState } from "./sessionState";
import { SessionStateMap } from "./sessionState";

function makeState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    workspaceId: overrides.workspaceId ?? "workspace-1",
    projectPath: overrides.projectPath ?? "/tmp/project",
    namedWorkspacePath: overrides.namedWorkspacePath ?? "/tmp/worktree/session-1",
    modeId: overrides.modeId ?? "exec",
    modelId: overrides.modelId ?? "anthropic:claude-opus-4-6",
    thinkingLevel: overrides.thinkingLevel ?? "off",
    defaultModelId: overrides.defaultModelId ?? "anthropic:claude-opus-4-6",
    defaultThinkingLevel: overrides.defaultThinkingLevel ?? "off",
    activePromptAbort: overrides.activePromptAbort,
  };
}

describe("SessionStateMap", () => {
  it("supports set/get/delete operations", () => {
    const map = new SessionStateMap();
    const state = makeState();

    map.set(state.sessionId, state);
    expect(map.get(state.sessionId)).toBe(state);

    map.delete(state.sessionId);
    expect(map.get(state.sessionId)).toBeUndefined();
  });

  it("require throws for missing sessions", () => {
    const map = new SessionStateMap();

    expect(() => map.require("missing-session")).toThrow("ACP session not found: missing-session");
  });

  it("require returns stored sessions", () => {
    const map = new SessionStateMap();
    const state = makeState();

    map.set(state.sessionId, state);

    expect(map.require(state.sessionId)).toBe(state);
  });

  it("values iterates all sessions", () => {
    const map = new SessionStateMap();
    const first = makeState();
    const second = makeState({
      sessionId: "session-2",
      workspaceId: "workspace-2",
    });

    map.set(first.sessionId, first);
    map.set(second.sessionId, second);

    expect([...map.values()]).toEqual([first, second]);
  });
});
