/**
 * Core types for the OSCAR analysis harness.
 * See docs/oscar-method.md — this file is the source of truth for the ledger,
 * diff classification, scout, and streaming-operation contracts.
 */

export type Dimension =
  | "objectives"
  | "scope"
  | "constraints"
  | "ambiguities"
  | "risks";

export const DIMENSIONS: Dimension[] = [
  "objectives",
  "scope",
  "constraints",
  "ambiguities",
  "risks",
];

/** Per-dimension item payloads (tech-spec § dimension item shapes). */
export type ObjectiveContent = { text: string };
export type ScopeContent = { text: string; kind: "direct" | "adjacent" | "implied" };
export type ConstraintContent = { text: string; severity: "hard" | "soft" };
export type AmbiguityContent = { question: string; interpretations: string[] };
export type RiskContent = { text: string; likelihood: "low" | "medium" | "high" };

export type DimensionContent =
  | ObjectiveContent
  | ScopeContent
  | ConstraintContent
  | AmbiguityContent
  | RiskContent;

export type ItemStatus = "fresh" | "confirmed" | "stale" | "invalidated";

export interface Anchor {
  start: number;
  end: number;
}

export interface OscarItem {
  id: string;
  dimension: Dimension;
  content: DimensionContent;
  /** Short verbatim quote from the prompt that justifies this item. */
  evidence: string;
  /** Evidence located in the current text; null when it couldn't be grounded. */
  anchor: Anchor | null;
  status: ItemStatus;
  /** Analysis revision that last touched this item. */
  revision: number;
}

export interface Ledger {
  items: OscarItem[];
  /** The exact text the settled judgements reflect. */
  analyzedText: string;
  revision: number;
}

export function emptyLedger(): Ledger {
  return { items: [], analyzedText: "", revision: 0 };
}

// ---------------------------------------------------------------------------
// Edit classification
// ---------------------------------------------------------------------------

export type EditClass = "none" | "append" | "insert" | "delete" | "replace" | "rewrite";

export interface ClassifiedDiff {
  editClass: EditClass;
  /** Start offset of the changed window (common-prefix length). */
  start: number;
  /** Text removed from the old string at `start`. */
  removed: string;
  /** Text added in the new string at `start`. */
  added: string;
}

// ---------------------------------------------------------------------------
// Operations — the model edits the ledger, never replaces it
// ---------------------------------------------------------------------------

export type OscarOperation =
  | {
      op: "add";
      dimension: Dimension;
      item: { id: string; content: DimensionContent; evidence: string };
    }
  | { op: "revise"; id: string; content: DimensionContent; evidence: string }
  | { op: "confirm"; id: string }
  | { op: "remove"; id: string; reason: string };

export interface AgentTask {
  id: string;
  /** Ledger item id that justified this task (usually an ambiguity or risk). */
  triggeredBy: string;
  agentRole: "codebase-scout" | "docs-reader" | "impact-analyzer" | "convention-checker";
  /** The exact prompt that agent would receive — a real dispatch, not a description. */
  prompt: string;
  expectedOutput: string;
}

export type AgentTaskStatus = "queued" | "cancelled";

export interface TrackedAgentTask extends AgentTask {
  status: AgentTaskStatus;
}

// ---------------------------------------------------------------------------
// Scout
// ---------------------------------------------------------------------------

export type ScoutAction = "wait" | "incremental" | "full";

export interface ScoutVerdict {
  action: ScoutAction;
  /** Surfaced in the UI as OSCAR's "inner monologue". */
  reason: string;
  affectedDimensions: Dimension[];
  midThought: boolean;
  /** Ledger item ids the new text appears to contradict or supersede. */
  contradicts: string[];
}

/** One-line-per-item digest the scout and incremental prompts both consume. */
export interface LedgerDigestEntry {
  id: string;
  dimension: Dimension;
  summary: string;
  status: ItemStatus;
}

// ---------------------------------------------------------------------------
// API contracts
// ---------------------------------------------------------------------------

export interface OscarAnalyzeRequest {
  prompt: string;
  context?: string;
  mode: "full" | "incremental";
  ledger?: LedgerDigestEntry[];
  diff?: ClassifiedDiff;
  hint?: Dimension[];
  contradicts?: string[];
}

export interface ScoutRequest {
  diff: ClassifiedDiff;
  /** Changed window ± 80 chars of context. */
  window: string;
  ledger: LedgerDigestEntry[];
  charsSinceAnalysis: number;
}
