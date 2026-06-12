import { locateEvidence } from "./anchor";
import { operationSchema } from "./schema";
import type {
  AgentTask,
  Dimension,
  Ledger,
  LedgerDigestEntry,
  OscarItem,
  OscarOperation,
  TrackedAgentTask,
} from "./types";

/**
 * The ledger reducer — applies streamed operations one by one, mid-flight.
 * Every rule from docs/oscar-method.md § Reducer rules lives here:
 * validate-before-apply, id discipline, caps enforced twice, stale-revision
 * guard, and the abort-safe revision lifecycle.
 */

/** Max active items per dimension — prompt rule AND reducer backstop. */
export const DIMENSION_CAP = 4;

export interface AnalysisRun {
  /** The ledger revision this run was dispatched against. */
  revision: number;
  /** The exact text the run is analyzing. */
  snapshotText: string;
  /** Item ids the diff/hint/contradicts marked for re-examination. */
  affectedIds: string[];
  mode: "full" | "incremental";
}

export interface ApplyResult {
  ledger: Ledger;
  /** Ids removed by this op (drives agent-task cancellation). */
  removedIds: string[];
  /** True if the op was dropped (stale revision, unknown id, invalid shape). */
  dropped: boolean;
  dropReason?: string;
}

/**
 * Start a run: bump the revision and mark items under re-examination stale.
 * Full mode resets the ledger — every judgement must be re-earned.
 */
export function dispatchRun(
  ledger: Ledger,
  opts: { snapshotText: string; affectedIds?: string[]; mode: "full" | "incremental" },
): { ledger: Ledger; run: AnalysisRun } {
  const revision = ledger.revision + 1;
  const affectedIds = opts.mode === "full" ? [] : (opts.affectedIds ?? []);
  const items =
    opts.mode === "full"
      ? []
      : ledger.items.map((item) =>
          affectedIds.includes(item.id) && item.status !== "invalidated"
            ? { ...item, status: "stale" as const }
            : item,
        );
  return {
    ledger: { ...ledger, items, revision },
    run: { revision, snapshotText: opts.snapshotText, affectedIds, mode: opts.mode },
  };
}

/**
 * Apply one completed operation. `currentText` is what anchors are located
 * against (the user may have typed past the snapshot); `near` disambiguates
 * duplicate quotes for new items.
 */
export function applyOperation(
  ledger: Ledger,
  rawOp: unknown,
  run: AnalysisRun,
  currentText: string,
  near: number | null = null,
): ApplyResult {
  // Stale-revision guard: ops from a superseded run are dropped.
  if (run.revision !== ledger.revision) {
    return { ledger, removedIds: [], dropped: true, dropReason: "stale revision" };
  }

  const parsed = operationSchema.safeParse(rawOp);
  if (!parsed.success) {
    return { ledger, removedIds: [], dropped: true, dropReason: "invalid op shape" };
  }
  const op = parsed.data as OscarOperation;

  switch (op.op) {
    case "add": {
      const existing = ledger.items.find((i) => i.id === op.item.id);
      if (existing) {
        // Id discipline: an add with a known id is a revise in disguise.
        return applyRevise(ledger, {
          op: "revise",
          id: op.item.id,
          content: op.item.content,
          evidence: op.item.evidence,
        }, run, currentText);
      }
      const item: OscarItem = {
        id: op.item.id,
        dimension: op.dimension,
        content: op.item.content,
        evidence: op.item.evidence,
        anchor: locateEvidence(currentText, op.item.evidence, near),
        status: "fresh",
        revision: run.revision,
      };
      let items = [...ledger.items, item];
      items = enforceCap(items, op.dimension);
      return { ledger: { ...ledger, items }, removedIds: [], dropped: false };
    }
    case "revise":
      return applyRevise(ledger, op, run, currentText);
    case "confirm": {
      const idx = ledger.items.findIndex((i) => i.id === op.id);
      if (idx === -1) {
        return { ledger, removedIds: [], dropped: true, dropReason: "unknown id" };
      }
      const items = ledger.items.slice();
      items[idx] = { ...items[idx], status: "confirmed", revision: run.revision };
      return { ledger: { ...ledger, items }, removedIds: [], dropped: false };
    }
    case "remove": {
      if (!ledger.items.some((i) => i.id === op.id)) {
        return { ledger, removedIds: [], dropped: true, dropReason: "unknown id" };
      }
      const items = ledger.items.filter((i) => i.id !== op.id);
      return { ledger: { ...ledger, items }, removedIds: [op.id], dropped: false };
    }
  }
}

function applyRevise(
  ledger: Ledger,
  op: Extract<OscarOperation, { op: "revise" }>,
  run: AnalysisRun,
  currentText: string,
): ApplyResult {
  const idx = ledger.items.findIndex((i) => i.id === op.id);
  if (idx === -1) {
    return { ledger, removedIds: [], dropped: true, dropReason: "unknown id" };
  }
  const prev = ledger.items[idx];
  const items = ledger.items.slice();
  items[idx] = {
    ...prev,
    content: op.content,
    evidence: op.evidence,
    // Meaning changed — re-anchor near the previous location.
    anchor: locateEvidence(currentText, op.evidence, prev.anchor?.start ?? null),
    status: "fresh",
    revision: run.revision,
  };
  return { ledger: { ...ledger, items }, removedIds: [], dropped: false };
}

/** Evict the oldest non-confirmed item when a dimension exceeds the cap. */
function enforceCap(items: OscarItem[], dimension: Dimension): OscarItem[] {
  const active = items.filter(
    (i) => i.dimension === dimension && i.status !== "invalidated",
  );
  if (active.length <= DIMENSION_CAP) return items;
  const evictable = active
    .filter((i) => i.status !== "confirmed")
    .sort((a, b) => a.revision - b.revision);
  const victim = evictable[0] ?? active[0];
  return items.filter((i) => i.id !== victim.id);
}

/**
 * Settle a run. Whether it completed or was aborted, `analyzedText` commits
 * to the snapshot (applied ops did examine that text). Only on completion do
 * surviving stale items flip to confirmed — silence is implicit confirm, but
 * an aborted run never reached them, so they stay visibly stale.
 */
export function commitRun(
  ledger: Ledger,
  run: AnalysisRun,
  outcome: "complete" | "aborted",
): Ledger {
  if (run.revision !== ledger.revision) return ledger;
  const items =
    outcome === "complete"
      ? ledger.items.map((item) =>
          run.affectedIds.includes(item.id) && item.status === "stale"
            ? { ...item, status: "confirmed" as const, revision: run.revision }
            : item,
        )
      : ledger.items;
  return { ...ledger, items, analyzedText: run.snapshotText };
}

/** One line per item — what the scout and the incremental prompt see. */
export function digestLedger(ledger: Ledger): LedgerDigestEntry[] {
  return ledger.items.map((item) => ({
    id: item.id,
    dimension: item.dimension,
    summary: summarizeContent(item),
    status: item.status,
  }));
}

export function summarizeContent(item: OscarItem): string {
  const c = item.content as Record<string, unknown>;
  if (typeof c.question === "string") return c.question;
  if (typeof c.text === "string") return c.text;
  return JSON.stringify(item.content);
}

// ---------------------------------------------------------------------------
// Agent tasks — same delta discipline as ops, keyed by triggeredBy
// ---------------------------------------------------------------------------

/** Upsert a streamed task: a task for a revised item replaces its old task. */
export function upsertTask(
  tasks: TrackedAgentTask[],
  task: AgentTask,
): TrackedAgentTask[] {
  const next = tasks.filter((t) => t.triggeredBy !== task.triggeredBy);
  next.push({ ...task, status: "queued" });
  return next;
}

/** Removing a ledger item cancels its task — no model output needed. */
export function cancelTasksFor(
  tasks: TrackedAgentTask[],
  removedItemIds: string[],
): TrackedAgentTask[] {
  if (removedItemIds.length === 0) return tasks;
  return tasks.map((t) =>
    removedItemIds.includes(t.triggeredBy) && t.status === "queued"
      ? { ...t, status: "cancelled" as const }
      : t,
  );
}
