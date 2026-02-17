import { useWorkspaceSidebarState } from "@/browser/stores/WorkspaceStore";
import { ModelDisplay } from "@/browser/components/Messages/ModelDisplay";
import { EmojiIcon } from "@/browser/components/icons/EmojiIcon";
import { CircleHelp, ExternalLinkIcon, Loader2, AlertTriangle, Check } from "lucide-react";
import { memo } from "react";
import { Tooltip, TooltipTrigger, TooltipContent } from "./ui/tooltip";
import { Button } from "./ui/button";

export const WorkspaceStatusIndicator = memo<{
  workspaceId: string;
  fallbackModel: string;
  /** When true the workspace is still being provisioned (show "starting…"). Passed as
   *  a prop so this component doesn't need to subscribe to the full WorkspaceContext. */
  isCreating?: boolean;
  /** Whether this workspace ended in an error state */
  hasError?: boolean;
  /** Whether this workspace has completed its task */
  isCompleted?: boolean;
}>(({ workspaceId, fallbackModel, isCreating, hasError, isCompleted }) => {
  const { canInterrupt, isStarting, awaitingUserQuestion, currentModel, agentStatus } =
    useWorkspaceSidebarState(workspaceId);

  // Show prompt when ask_user_question is pending - make it prominent
  if (awaitingUserQuestion) {
    return (
      <div className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
        <CircleHelp aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">Mux has a few questions</span>
      </div>
    );
  }

  if (agentStatus) {
    return (
      <div className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
        {agentStatus.emoji && <EmojiIcon emoji={agentStatus.emoji} className="h-3 w-3 shrink-0" />}
        <span className="min-w-0 truncate">{agentStatus.message}</span>
        {agentStatus.url && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="flex h-4 w-4 shrink-0 items-center justify-center [&_svg]:size-3"
              >
                <a href={agentStatus.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLinkIcon />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent align="center">{agentStatus.url}</TooltipContent>
          </Tooltip>
        )}
      </div>
    );
  }

  // Show error state
  if (hasError) {
    return (
      <div className="text-red-400 flex min-w-0 items-center gap-1.5 text-xs">
        <AlertTriangle aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">Error encountered</span>
      </div>
    );
  }

  // Show completed state with checkmark
  if (isCompleted && !canInterrupt && !isStarting && !isCreating && !awaitingUserQuestion && !agentStatus) {
    return (
      <div className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
        <Check aria-hidden="true" className="h-3 w-3 shrink-0" />
        <span className="min-w-0 truncate">Completed</span>
      </div>
    );
  }

  const phase: "starting" | "streaming" | null = canInterrupt
    ? "streaming"
    : isStarting || isCreating
      ? "starting"
      : null;

  if (!phase) {
    return null;
  }

  const modelToShow = canInterrupt ? (currentModel ?? fallbackModel) : fallbackModel;
  const suffix = phase === "starting" ? "- starting..." : "- streaming...";

  return (
    <div className="text-muted flex min-w-0 items-center gap-1.5 text-xs">
      {phase === "starting" && (
        <Loader2 aria-hidden="true" className="h-3 w-3 shrink-0 animate-spin opacity-70" />
      )}
      {modelToShow ? (
        <>
          <span className="min-w-0 truncate">
            <ModelDisplay modelString={modelToShow} showTooltip={false} />
          </span>
          <span className="shrink-0 opacity-70">{suffix}</span>
        </>
      ) : (
        <span className="min-w-0 truncate">
          {phase === "starting" ? "Assistant - starting..." : "Assistant - streaming..."}
        </span>
      )}
    </div>
  );
});
WorkspaceStatusIndicator.displayName = "WorkspaceStatusIndicator";
