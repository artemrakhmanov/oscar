import { shiftAnchors } from "./anchor";
import { decide, SCOUT_RACE_MS } from "./decide";
import { classifyEdit, diffWindow } from "./diff";
import { TriggerGate } from "./gate";
import {
  applyOperation,
  cancelTasksFor,
  commitRun,
  digestLedger,
  dispatchRun,
  upsertTask,
  type AnalysisRun,
} from "./ledger";
import { agentTaskSchema } from "./schema";
import type {
  ClassifiedDiff,
  Ledger,
  OscarAnalyzeRequest,
  ScoutRequest,
  ScoutVerdict,
  TrackedAgentTask,
} from "./types";
import { emptyLedger } from "./types";
import { parsePartialJson } from "ai";

/**
 * The OSCAR harness — everything between the keystroke and the drawer.
 * Framework-free: fetch is injected, timers/clock are the globals (tests use
 * fake timers), and React subscribes via subscribe/getSnapshot.
 *
 * Call cadence (docs/oscar-method.md § Call cadence):
 *   keystroke → anchors shift + optimistic invalidation (pure code)
 *             → trigger gate → maybe scout consult (visible reason)
 *   ~700ms pause → decide (hard rules + latest verdict) → wait | incremental | full
 *   resumed typing → abort fetch; ledger keeps last settled state
 */

export const PAUSE_MS = 700;

export interface HarnessEventInput {
  kind: "system" | "agent" | "tool" | "output" | "error";
  label: string;
  detail?: string;
  source?: string;
}

export type HarnessPhase = "idle" | "consulting" | "analyzing";

export interface HarnessSnapshot {
  ledger: Ledger;
  tasks: TrackedAgentTask[];
  /** The scout's latest inner monologue line, shown under the drawer. */
  scoutReason: string | null;
  phase: HarnessPhase;
  lastRunMode: "full" | "incremental" | null;
}

interface HarnessDeps {
  fetcher?: typeof fetch;
  onEvent?: (event: HarnessEventInput) => void;
}

export class OscarHarness {
  private fetcher: typeof fetch;
  private onEvent: (event: HarnessEventInput) => void;

  private gate = new TriggerGate();
  private ledger: Ledger = emptyLedger();
  private tasks: TrackedAgentTask[] = [];
  private text = "";
  private scoutReason: string | null = null;
  private phase: HarnessPhase = "idle";
  private lastRunMode: "full" | "incremental" | null = null;

  /** Bumped on every edit; async continuations bail when it moved. */
  private editEpoch = 0;

  private pauseTimer: ReturnType<typeof setTimeout> | null = null;
  private gateTimer: ReturnType<typeof setTimeout> | null = null;

  private consultSeq = 0;
  private scoutInFlight: Promise<void> | null = null;
  private latestVerdict: { seq: number; verdict: ScoutVerdict } | null = null;

  private analysisAbort: AbortController | null = null;

  private listeners = new Set<() => void>();
  private snapshot: HarnessSnapshot;

  constructor(deps: HarnessDeps = {}) {
    this.fetcher = deps.fetcher ?? ((...args) => fetch(...args));
    this.onEvent = deps.onEvent ?? (() => {});
    this.snapshot = this.buildSnapshot();
  }

  // -- store interface ------------------------------------------------------

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): HarnessSnapshot => this.snapshot;

  private buildSnapshot(): HarnessSnapshot {
    return {
      ledger: this.ledger,
      tasks: this.tasks,
      scoutReason: this.scoutReason,
      phase: this.phase,
      lastRunMode: this.lastRunMode,
    };
  }

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const l of this.listeners) l();
  }

  // -- keystroke intake -----------------------------------------------------

  onTextChange(text: string, opts: { isPaste?: boolean } = {}): void {
    if (text === this.text) return;
    const prev = this.text;
    this.text = text;
    this.editEpoch++;

    // Resumed typing aborts the in-flight analysis (its run already
    // committed what it applied; unexamined items stay visibly stale).
    this.analysisAbort?.abort();
    this.analysisAbort = null;

    // 0ms: mechanical anchor maintenance + optimistic invalidation.
    const keyDiff = classifyEdit(prev, text);
    if (keyDiff.editClass !== "none" && keyDiff.editClass !== "rewrite") {
      const { items, invalidatedIds } = shiftAnchors(this.ledger.items, keyDiff);
      this.ledger = { ...this.ledger, items };
      if (invalidatedIds.length > 0) {
        this.onEvent({
          kind: "system",
          source: "harness",
          label: "optimistic invalidation",
          detail: `deleted text undercut ${invalidatedIds.join(", ")}`,
        });
      }
    } else if (keyDiff.editClass === "rewrite" && text.trim() === "") {
      this.resetState();
    }

    // Trigger gate (pure code): boundary crossed?
    const now = Date.now();
    const gateResult = this.gate.onEdit(prev, text, now, opts.isPaste ?? false);
    if (this.gateTimer) clearTimeout(this.gateTimer);
    if (gateResult.kind === "consult") {
      this.dispatchConsult(gateResult.reason);
    } else if (gateResult.kind === "defer") {
      const epoch = this.editEpoch;
      this.gateTimer = setTimeout(() => {
        if (epoch !== this.editEpoch) return;
        const idle = this.gate.checkIdle(this.text, Date.now());
        if (idle.kind === "consult") this.dispatchConsult(gateResult.reason);
      }, gateResult.delayMs);
    }

    // The pause clock: decision point ~700ms after the last keystroke.
    if (this.pauseTimer) clearTimeout(this.pauseTimer);
    const epoch = this.editEpoch;
    this.pauseTimer = setTimeout(() => {
      if (epoch !== this.editEpoch) return;
      void this.onPause();
    }, PAUSE_MS);

    this.emit();
  }

  /** Full reset — e.g. the composer was cleared or the prompt was sent. */
  reset(): void {
    this.resetState();
    this.text = "";
    this.gate = new TriggerGate();
    this.emit();
  }

  private resetState(): void {
    this.ledger = emptyLedger();
    this.tasks = [];
    this.scoutReason = null;
    this.lastRunMode = null;
    this.latestVerdict = null;
  }

  // -- scout ----------------------------------------------------------------

  private dispatchConsult(reason: string): void {
    // At most one scout request in flight; the gate keeps accumulating.
    if (this.scoutInFlight) return;
    const text = this.text;
    const diff = classifyEdit(this.ledger.analyzedText, text);
    if (diff.editClass === "none") return;

    const seq = ++this.consultSeq;
    this.gate.markConsulted(text, Date.now());
    this.phase = "consulting";
    this.onEvent({
      kind: "agent",
      source: "scout",
      label: `scout consulted (${reason})`,
      detail: `${diff.editClass}: "${diff.added || diff.removed}"`.slice(0, 120),
    });

    const body: ScoutRequest = {
      diff,
      window: diffWindow(text, diff),
      ledger: digestLedger(this.ledger),
      charsSinceAnalysis: Math.abs(text.length - this.ledger.analyzedText.length),
    };

    this.scoutInFlight = this.fetcher("/api/oscar/scout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`scout ${res.status}`);
        const verdict = (await res.json()) as ScoutVerdict;
        // Discard if a newer consult has been dispatched meanwhile.
        if (seq !== this.consultSeq) return;
        this.latestVerdict = { seq, verdict };
        this.scoutReason = verdict.reason;
        this.onEvent({
          kind: "agent",
          source: "scout",
          label: `scout: ${verdict.action}`,
          detail: verdict.reason,
        });
        this.emit();
      })
      .catch(() => {
        // Scout is an optimization, never a dependency — local rules decide.
      })
      .finally(() => {
        this.scoutInFlight = null;
        if (this.phase === "consulting") {
          this.phase = "idle";
          this.emit();
        }
      });
  }

  /** Race the in-flight consult against the scout timeout. */
  private async resolveVerdict(): Promise<ScoutVerdict | null> {
    if (this.scoutInFlight) {
      await Promise.race([
        this.scoutInFlight,
        new Promise((r) => setTimeout(r, SCOUT_RACE_MS)),
      ]);
    }
    if (this.latestVerdict && this.latestVerdict.seq === this.consultSeq) {
      return this.latestVerdict.verdict;
    }
    return null;
  }

  // -- the decision point ---------------------------------------------------

  private async onPause(): Promise<void> {
    const epoch = this.editEpoch;
    const text = this.text;
    const diff = classifyEdit(this.ledger.analyzedText, text);

    const verdict = await this.resolveVerdict();
    if (epoch !== this.editEpoch) return; // user resumed typing mid-race

    const decision = decide({
      text,
      diff,
      ledgerEmpty: this.ledger.items.length === 0,
      verdict,
    });

    if (decision === "skip") return;
    if (decision === "wait") {
      this.onEvent({
        kind: "system",
        source: "harness",
        label: "holding",
        detail: verdict?.reason ?? "mid-thought or below threshold",
      });
      return;
    }
    await this.runAnalysis(decision, diff, verdict);
  }

  // -- the analysis run -----------------------------------------------------

  private async runAnalysis(
    mode: "full" | "incremental",
    diff: ClassifiedDiff,
    verdict: ScoutVerdict | null,
  ): Promise<void> {
    const epoch = this.editEpoch;
    const text = this.text;
    const contradicts = verdict?.contradicts ?? [];
    const affectedIds =
      mode === "incremental"
        ? [...new Set([...this.affectedByWindow(diff), ...contradicts])]
        : [];

    const { ledger, run } = dispatchRun(this.ledger, {
      snapshotText: text,
      affectedIds,
      mode,
    });
    this.ledger = ledger;
    if (mode === "full") this.tasks = [];
    this.phase = "analyzing";
    this.lastRunMode = mode;
    this.onEvent({
      kind: "tool",
      source: "harness",
      label: `analysis dispatched (${mode}, rev ${run.revision})`,
      detail:
        mode === "incremental"
          ? `${diff.editClass}; re-examining ${affectedIds.length ? affectedIds.join(", ") : "nothing specific"}`
          : undefined,
    });
    this.emit();

    const body: OscarAnalyzeRequest = {
      prompt: text,
      mode,
      ledger: mode === "incremental" ? digestLedger(this.ledger) : undefined,
      diff: mode === "incremental" ? diff : undefined,
      hint: verdict?.affectedDimensions,
      contradicts: contradicts.length > 0 ? contradicts : undefined,
    };

    const controller = new AbortController();
    this.analysisAbort = controller;
    const counters = { ops: 0, tasks: 0 };

    try {
      const res = await this.fetcher("/api/oscar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) throw new Error(`analysis ${res.status}`);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        await this.applyPartial(acc, run, diff, false, counters);
      }
      await this.applyPartial(acc, run, diff, true, counters);

      this.ledger = commitRun(this.ledger, run, "complete");
      this.onEvent({
        kind: "output",
        source: "harness",
        label: `analysis settled (rev ${run.revision})`,
        detail: `${counters.ops} ops, ${counters.tasks} agent tasks`,
      });
    } catch (err) {
      const aborted = controller.signal.aborted;
      this.ledger = commitRun(this.ledger, run, "aborted");
      this.onEvent(
        aborted
          ? {
              kind: "system",
              source: "harness",
              label: `analysis aborted (rev ${run.revision})`,
              detail: "user resumed typing; applied ops kept, rest stays stale",
            }
          : {
              kind: "error",
              source: "harness",
              label: "analysis failed",
              detail: err instanceof Error ? err.message : String(err),
            },
      );
    } finally {
      if (this.analysisAbort === controller) this.analysisAbort = null;
      if (epoch === this.editEpoch || this.phase === "analyzing") {
        this.phase = "idle";
      }
      this.emit();
    }
  }

  /**
   * Apply every newly-completed operation/task from the accumulated partial
   * JSON. The trailing array element may still be streaming — it's held back
   * until the next element begins (or the stream ends); zod validation in the
   * reducer is the final backstop.
   */
  private async applyPartial(
    acc: string,
    run: AnalysisRun,
    diff: ClassifiedDiff,
    final: boolean,
    counters: { ops: number; tasks: number },
  ): Promise<void> {
    const { value } = await parsePartialJson(acc);
    if (!value || typeof value !== "object") return;
    const payload = value as { operations?: unknown[]; agentTasks?: unknown[] };

    const ops = Array.isArray(payload.operations) ? payload.operations : [];
    const opLimit = final ? ops.length : Math.max(ops.length - 1, 0);
    let changed = false;

    for (; counters.ops < opLimit; counters.ops++) {
      const near = diff.start + Math.floor(diff.added.length / 2);
      const result = applyOperation(this.ledger, ops[counters.ops], run, this.text, near);
      if (result.dropped) {
        if (process.env.NODE_ENV !== "production") {
          this.onEvent({
            kind: "error",
            source: "reducer",
            label: `op dropped: ${result.dropReason}`,
            detail: JSON.stringify(ops[counters.ops])?.slice(0, 160),
          });
        }
        continue;
      }
      this.ledger = result.ledger;
      if (result.removedIds.length > 0) {
        this.tasks = cancelTasksFor(this.tasks, result.removedIds);
      }
      changed = true;
    }

    const rawTasks = Array.isArray(payload.agentTasks) ? payload.agentTasks : [];
    const taskLimit = final ? rawTasks.length : Math.max(rawTasks.length - 1, 0);
    for (; counters.tasks < taskLimit; counters.tasks++) {
      const parsed = agentTaskSchema.safeParse(rawTasks[counters.tasks]);
      if (!parsed.success) continue;
      // Delta discipline: tasks may only attach to items this run touched —
      // and never to items that no longer exist.
      if (!this.ledger.items.some((i) => i.id === parsed.data.triggeredBy)) continue;
      this.tasks = upsertTask(this.tasks, parsed.data);
      this.onEvent({
        kind: "agent",
        source: "dispatch-queue",
        label: `task drafted: ${parsed.data.agentRole}`,
        detail: `would dispatch on send — ${parsed.data.expectedOutput}`,
      });
      changed = true;
    }

    if (changed) this.emit();
  }

  /** Items whose anchors overlap the changed window (current-text coords). */
  private affectedByWindow(diff: ClassifiedDiff): string[] {
    const windowStart = diff.start;
    const windowEnd = diff.start + diff.added.length;
    return this.ledger.items
      .filter((i) => i.anchor && i.anchor.start < windowEnd + 1 && i.anchor.end > windowStart - 1)
      .map((i) => i.id);
  }

  /** Test/debug accessors. */
  get currentText(): string {
    return this.text;
  }
}
