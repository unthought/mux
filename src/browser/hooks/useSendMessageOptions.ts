import { WORKSPACE_DEFAULTS } from "@/constants/workspaceDefaults";
import { useThinkingLevel } from "./useThinkingLevel";
import { useAgent } from "@/browser/contexts/AgentContext";
import { usePersistedState } from "./usePersistedState";
import { getDefaultModel } from "./useModelsFromSettings";
import { migrateGatewayModel, useGateway, isProviderSupported } from "./useGatewayModels";
import { getModelKey } from "@/common/constants/storage";
import type { SendMessageOptions } from "@/common/orpc/types";
import type { ThinkingLevel } from "@/common/types/thinking";
import type { MuxProviderOptions } from "@/common/types/providerOptions";
import { getSendOptionsFromStorage } from "@/browser/utils/messages/sendOptions";
import { useProviderOptions } from "./useProviderOptions";
import { useExperimentOverrideValue } from "./useExperiments";
import { EXPERIMENT_IDS } from "@/common/constants/experiments";

/**
 * Transform model to gateway format using reactive gateway state.
 * This ensures the component re-renders when gateway toggles change.
 */
function applyGatewayTransform(modelId: string, gateway: GatewayState): string {
  if (!gateway.isActive || !isProviderSupported(modelId) || !gateway.modelUsesGateway(modelId)) {
    return modelId;
  }

  // Transform provider:model to mux-gateway:provider/model
  const colonIndex = modelId.indexOf(":");
  if (colonIndex === -1) return modelId;

  const provider = modelId.slice(0, colonIndex);
  const model = modelId.slice(colonIndex + 1);
  return `mux-gateway:${provider}/${model}`;
}

interface ExperimentValues {
  programmaticToolCalling: boolean | undefined;
  programmaticToolCallingExclusive: boolean | undefined;
  system1: boolean | undefined;
}

/**
 * Construct SendMessageOptions from raw values
 * Shared logic for both hook and non-hook versions
 *
 * Note: Plan mode instructions are handled by the backend (has access to plan file path)
 */
function constructSendMessageOptions(
  agentId: string,
  thinkingLevel: ThinkingLevel,
  preferredModel: string | null | undefined,
  providerOptions: MuxProviderOptions,
  fallbackModel: string,
  gateway: GatewayState,
  experimentValues: ExperimentValues
): SendMessageOptions {
  // Ensure model is always a valid string (defensive against corrupted localStorage)
  const rawModel =
    typeof preferredModel === "string" && preferredModel ? preferredModel : fallbackModel;

  // Migrate any legacy mux-gateway:provider/model format to canonical form
  const baseModel = migrateGatewayModel(rawModel);

  // Preserve the user's preferred thinking level; backend enforces per-model policy.
  const uiThinking = thinkingLevel;

  // Transform to gateway format if gateway is enabled for this model (reactive)
  const model = applyGatewayTransform(baseModel, gateway);

  return {
    thinkingLevel: uiThinking,
    model,
    agentId,
    // toolPolicy is computed by backend from agent definitions (resolveToolPolicyForAgent)
    providerOptions,
    experiments: {
      programmaticToolCalling: experimentValues.programmaticToolCalling,
      programmaticToolCallingExclusive: experimentValues.programmaticToolCallingExclusive,
      system1: experimentValues.system1,
    },
  };
}

/**
 * Extended send options that includes both the gateway-transformed model
 * and the base model (for UI components that need canonical model names).
 */
export interface SendMessageOptionsWithBase extends SendMessageOptions {
  /** Base model in canonical format (e.g., "openai:gpt-5.1-codex-max") for UI/policy checks */
  baseModel: string;
}

/**
 * Single source of truth for message send options (ChatInput, RetryBarrier, etc.).
 * Subscribes to persisted preferences so model/thinking/agent changes propagate automatically.
 */
export function useSendMessageOptions(workspaceId: string): SendMessageOptionsWithBase {
  const [thinkingLevel] = useThinkingLevel();
  const { agentId, disableWorkspaceAgents } = useAgent();
  const { options: providerOptions } = useProviderOptions();

  // Subscribe to the global default model preference so backend-seeded values apply
  // immediately on fresh origins (e.g., when switching ports).
  const [defaultModelPref] = usePersistedState<string>(
    DEFAULT_MODEL_KEY,
    WORKSPACE_DEFAULTS.model,
    { listener: true }
  );
  const defaultModel = normalizeModelPreference(defaultModelPref, WORKSPACE_DEFAULTS.model);

  // Workspace-scoped model preference. If unset, fall back to the global default model.
  // Note: we intentionally *don't* pass defaultModel as the usePersistedState initialValue;
  // initialValue is sticky and would lock in the fallback before startup seeding.
  const [preferredModel] = usePersistedState<string | null>(getModelKey(workspaceId), null, {
    listener: true,
  });

  // Subscribe to local override state so toggles apply immediately.
  // If undefined, the backend will apply the PostHog assignment.
  const programmaticToolCalling = useExperimentOverrideValue(
    EXPERIMENT_IDS.PROGRAMMATIC_TOOL_CALLING
  );
  const programmaticToolCallingExclusive = useExperimentOverrideValue(
    EXPERIMENT_IDS.PROGRAMMATIC_TOOL_CALLING_EXCLUSIVE
  );
  const system1 = useExperimentOverrideValue(EXPERIMENT_IDS.SYSTEM_1);
  const execSubagentHardRestart = useExperimentOverrideValue(
    EXPERIMENT_IDS.EXEC_SUBAGENT_HARD_RESTART
  );

  // Compute base model (canonical format) for UI components
  const baseModel = normalizeModelPreference(preferredModel, defaultModel);

  const options = buildSendMessageOptions({
    agentId,
    thinkingLevel,
    model: baseModel,
    providerOptions,
    defaultModel,
    gateway,
    { programmaticToolCalling, programmaticToolCallingExclusive, system1 }
  );

  return {
    ...options,
    baseModel,
  };
}
