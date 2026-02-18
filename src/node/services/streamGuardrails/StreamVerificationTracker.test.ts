import { describe, expect, test } from "bun:test";

import { StreamVerificationTracker } from "./StreamVerificationTracker";

describe("StreamVerificationTracker", () => {
  test("hasValidationAttempt is false initially and true after markValidationAttempt", () => {
    const tracker = new StreamVerificationTracker();

    expect(tracker.hasValidationAttempt()).toBe(false);

    tracker.markValidationAttempt();
    expect(tracker.hasValidationAttempt()).toBe(true);
  });

  test("nudge lifecycle for completion guard", () => {
    const tracker = new StreamVerificationTracker();

    expect(tracker.hasBeenNudged()).toBe(false);
    expect(tracker.shouldNudgeBeforeAllowingReport(false)).toBe(false);
    expect(tracker.shouldNudgeBeforeAllowingReport(true)).toBe(true);

    tracker.markNudged();
    expect(tracker.hasBeenNudged()).toBe(true);
    expect(tracker.shouldNudgeBeforeAllowingReport(true)).toBe(false);

    tracker.markValidationAttempt();
    expect(tracker.hasValidationAttempt()).toBe(true);
    expect(tracker.shouldNudgeBeforeAllowingReport(true)).toBe(false);
  });
});
