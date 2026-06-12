import { endsMidWord } from "./diff";
import type { ClassifiedDiff, ScoutAction, ScoutVerdict } from "./types";

/**
 * The scout advises; code decides (docs/oscar-method.md § scout).
 * Hard rules run first and need no model; the scout verdict (raced with a
 * timeout by the harness) fills the gap; local fallback covers a slow scout.
 */

/** Below this, there is nothing worth analyzing. */
export const MIN_ANALYZABLE_CHARS = 15;
/** How long the harness waits for a scout verdict before deciding locally. */
export const SCOUT_RACE_MS = 250;

export type Decision = ScoutAction | "skip";

export interface DecisionInput {
  text: string;
  /** Diff from analyzedText to the current text. */
  diff: ClassifiedDiff;
  ledgerEmpty: boolean;
  /** Latest non-superseded verdict, or null if the scout lost the race. */
  verdict: ScoutVerdict | null;
}

/** Hard rules — returns null when the scout's opinion is wanted. */
export function hardDecision(
  input: Pick<DecisionInput, "text" | "diff" | "ledgerEmpty">,
): Decision | null {
  if (input.text.trim().length < MIN_ANALYZABLE_CHARS) return "wait";
  if (input.diff.editClass === "none") return "skip";
  if (input.diff.editClass === "rewrite") return "full";
  if (input.ledgerEmpty) return "full";
  if (
    (input.diff.editClass === "append" || input.diff.editClass === "insert") &&
    endsMidWord(input.text)
  ) {
    return "wait";
  }
  return null;
}

/** Local fallback when the scout times out or errors. */
export function fallbackDecision(diff: ClassifiedDiff): ScoutAction {
  switch (diff.editClass) {
    case "append":
    case "insert":
    case "delete":
    case "replace":
      return "incremental";
    default:
      return "full";
  }
}

export function decide(input: DecisionInput): Decision {
  const hard = hardDecision(input);
  if (hard !== null) return hard;

  if (input.verdict) {
    // A non-empty contradicts list forces a run — never wait on a contradiction.
    if (input.verdict.contradicts.length > 0 && input.verdict.action === "wait") {
      return "incremental";
    }
    return input.verdict.action;
  }
  return fallbackDecision(input.diff);
}
