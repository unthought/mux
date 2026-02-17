import { describe, expect, it } from "bun:test";
import assert from "@/common/utils/assert";
import { KNOWN_MODELS } from "@/common/constants/knownModels";
import { THINKING_LEVELS } from "@/common/types/thinking";
import type { SessionState } from "../sessionState";
import {
  MODEL_CONFIG_ID,
  THINKING_LEVEL_CONFIG_ID,
  buildAvailableModes,
  buildConfigOptions,
} from "./configOptions";

function makeSessionState(overrides: Partial<SessionState> = {}): SessionState {
  return {
    sessionId: overrides.sessionId ?? "session-1",
    workspaceId: overrides.workspaceId ?? "workspace-1",
    projectPath: overrides.projectPath ?? "/repo",
    modeId: overrides.modeId ?? "exec",
    modelId: overrides.modelId ?? KNOWN_MODELS.OPUS.id,
    thinkingLevel: overrides.thinkingLevel ?? "off",
    activePromptAbort: overrides.activePromptAbort,
  };
}

describe("buildAvailableModes", () => {
  it("returns exec and plan modes with labels", () => {
    expect(buildAvailableModes()).toEqual([
      {
        id: "exec",
        name: "Exec",
        description: "Execute changes autonomously",
      },
      {
        id: "plan",
        name: "Plan",
        description: "Create implementation plans",
      },
    ]);
  });
});

describe("buildConfigOptions", () => {
  it("returns model and thinking level options with current values", () => {
    const state = makeSessionState({
      modelId: KNOWN_MODELS.GPT.id,
      thinkingLevel: "high",
    });

    const options = buildConfigOptions(state);
    expect(options).toHaveLength(2);

    const modelOption = options.find((option) => option.id === MODEL_CONFIG_ID);
    expect(modelOption).toBeDefined();
    expect(modelOption?.currentValue).toBe(KNOWN_MODELS.GPT.id);

    if (!modelOption || modelOption.type !== "select") {
      throw new Error("Expected model option to be a select option");
    }

    expect(
      modelOption.options.some(
        (option) => "value" in option && option.value === KNOWN_MODELS.GPT.id
      )
    ).toBe(true);

    const thinkingOption = options.find((option) => option.id === THINKING_LEVEL_CONFIG_ID);
    expect(thinkingOption).toBeDefined();
    expect(thinkingOption?.currentValue).toBe("high");

    if (!thinkingOption || thinkingOption.type !== "select") {
      throw new Error("Expected thinking option to be a select option");
    }

    expect(
      thinkingOption.options.map((option) => {
        assert("value" in option, "Expected option to have value property");
        return option.value;
      })
    ).toEqual([...THINKING_LEVELS]);
  });

  it("adds the current model to select options when it is custom", () => {
    const state = makeSessionState({
      modelId: "custom:my-model",
    });

    const options = buildConfigOptions(state);
    const modelOption = options.find((option) => option.id === MODEL_CONFIG_ID);

    if (!modelOption || modelOption.type !== "select") {
      throw new Error("Expected model option to be a select option");
    }

    expect(modelOption.options).toEqual(
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument -- vitest matcher typing
      expect.arrayContaining([
        expect.objectContaining({
          value: "custom:my-model",
          name: "custom:my-model",
          description: "custom",
        }),
      ])
    );
  });
});
