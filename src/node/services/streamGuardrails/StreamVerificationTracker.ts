/**
 * Tracks whether a stream attempted validation commands before completion.
 */
export class StreamVerificationTracker {
  private validationAttempted = false;
  private nudgedBeforeReport = false;

  markValidationAttempt(): void {
    this.validationAttempted = true;
  }

  hasValidationAttempt(): boolean {
    return this.validationAttempted;
  }

  hasBeenNudged(): boolean {
    return this.nudgedBeforeReport;
  }

  markNudged(): void {
    this.nudgedBeforeReport = true;
  }

  shouldNudgeBeforeAllowingReport(hasEdits: boolean): boolean {
    return hasEdits && !this.validationAttempted && !this.nudgedBeforeReport;
  }
}
