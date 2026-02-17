import type * as schema from "@agentclientprotocol/sdk";
import { KNOWN_MODELS } from "@/common/constants/knownModels";
import type { AgentMode } from "@/common/types/mode";
import { THINKING_LEVELS, type ThinkingLevel, isThinkingLevel } from "@/common/types/thinking";
import { formatModelDisplayName } from "@/common/utils/ai/modelDisplay";
import { getModelName } from "@/common/utils/ai/models";
import assert from "@/common/utils/assert";
import type { SessionState } from "../sessionState";

export const MODEL_CONFIG_ID = "model";
export const THINKING_LEVEL_CONFIG_ID = "thinking_level";

const FALLBACK_MODE_ID: AgentMode = "exec";
const ACP_SELECTABLE_MODES = ["exec", "plan"] as const;

type ACPSelectableMode = (typeof ACP_SELECTABLE_MODES)[number];

const ACP_MODES: readonly schema.SessionMode[] = [
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
] as const;

const BASE_MODEL_OPTIONS = buildBaseModelOptions();
const BASE_MODEL_INFOS = buildBaseModelInfos();

function buildBaseModelOptions(): schema.SessionConfigSelectOption[] {
  const uniqueById = new Map<string, schema.SessionConfigSelectOption>();
  for (const knownModel of Object.values(KNOWN_MODELS)) {
    uniqueById.set(knownModel.id, {
      name: formatModelDisplayName(getModelName(knownModel.id)),
      value: knownModel.id,
      description: knownModel.provider,
    });
  }

  return [...uniqueById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function buildBaseModelInfos(): schema.ModelInfo[] {
  const uniqueById = new Map<string, schema.ModelInfo>();
  for (const knownModel of Object.values(KNOWN_MODELS)) {
    uniqueById.set(knownModel.id, {
      modelId: knownModel.id,
      name: formatModelDisplayName(getModelName(knownModel.id)),
    });
  }

  return [...uniqueById.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function withCurrentModelOption(currentModelId: string): {
  modelOptions: schema.SessionConfigSelectOption[];
  modelInfos: schema.ModelInfo[];
} {
  assert(currentModelId.trim().length > 0, "currentModelId must be non-empty");

  const optionExists = BASE_MODEL_OPTIONS.some((option) => option.value === currentModelId);
  const infoExists = BASE_MODEL_INFOS.some((info) => info.modelId === currentModelId);

  const customOption: schema.SessionConfigSelectOption = {
    name: currentModelId,
    value: currentModelId,
    description: "custom",
  };

  const customInfo: schema.ModelInfo = {
    modelId: currentModelId,
    name: currentModelId,
  };

  return {
    modelOptions: optionExists ? BASE_MODEL_OPTIONS : [...BASE_MODEL_OPTIONS, customOption],
    modelInfos: infoExists ? BASE_MODEL_INFOS : [...BASE_MODEL_INFOS, customInfo],
  };
}

function buildThinkingOptions(): schema.SessionConfigSelectOption[] {
  return THINKING_LEVELS.map((level) => ({
    name: level,
    value: level,
  }));
}

const THINKING_OPTIONS = buildThinkingOptions();

export function isSelectableModeId(value: string): value is ACPSelectableMode {
  return ACP_SELECTABLE_MODES.includes(value as ACPSelectableMode);
}

export function resolveModeId(value: unknown, fallback: AgentMode = FALLBACK_MODE_ID): AgentMode {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "plan") {
    return "plan";
  }

  if (normalized === "exec" || normalized === "compact") {
    return "exec";
  }

  return fallback;
}

export function resolveThinkingLevel(
  value: unknown,
  fallback: ThinkingLevel = "off"
): ThinkingLevel {
  if (typeof value !== "string") {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (isThinkingLevel(normalized)) {
    return normalized;
  }

  return fallback;
}

export function buildAvailableModes(): schema.SessionMode[] {
  return [...ACP_MODES];
}

export function buildModeState(state: SessionState): schema.SessionModeState {
  return {
    availableModes: buildAvailableModes(),
    currentModeId: resolveModeId(state.modeId),
  };
}

export function buildModelState(state: SessionState): schema.SessionModelState {
  const models = withCurrentModelOption(state.modelId);
  return {
    availableModels: models.modelInfos,
    currentModelId: state.modelId,
  };
}

export function buildConfigOptions(state: SessionState): schema.SessionConfigOption[] {
  const models = withCurrentModelOption(state.modelId);

  return [
    {
      type: "select",
      id: MODEL_CONFIG_ID,
      name: "Model",
      category: "model",
      currentValue: state.modelId,
      options: models.modelOptions,
    },
    {
      type: "select",
      id: THINKING_LEVEL_CONFIG_ID,
      name: "Thinking Level",
      category: "thought_level",
      currentValue: state.thinkingLevel,
      options: THINKING_OPTIONS,
    },
  ];
}

export function buildCurrentModeUpdate(modeId: AgentMode): schema.CurrentModeUpdate {
  return {
    currentModeId: resolveModeId(modeId),
  };
}

export function buildConfigOptionUpdate(state: SessionState): schema.ConfigOptionUpdate {
  return {
    configOptions: buildConfigOptions(state),
  };
}
