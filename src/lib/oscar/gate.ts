import { classifyEdit } from "./diff";

/**
 * The deterministic trigger gate — pure code, zero cost, runs on every
 * keystroke and decides whether the scout is even consulted. "Always-on"
 * describes availability, not firing rate (docs/oscar-method.md § scout).
 */

/** Don't consult twice within this window; coalesce into the latest state. */
export const CONSULT_FLOOR_MS = 500;
/** Wait out backspace bursts before treating a deletion as settled. */
export const DELETE_SETTLE_MS = 500;
/** Pause with unconsulted changes pending → consult anyway. */
export const IDLE_BACKSTOP_MS = 2000;
/** New words since the last consult that force a consult at a word boundary. */
export const WORD_BURST = 6;
/** Pastes above this size always trigger. */
export const PASTE_MIN_CHARS = 20;

const CONNECTIVES = new Set([
  "and", "or", "but", "not", "except", "without", "instead", "unless",
  "only", "also", "then", "don't", "never", "must", "should",
]);

const REVERSAL_MARKERS = [
  "actually", "no wait", "scratch that", "forget", "rather", "on second thought",
];

export type GateResult =
  | { kind: "consult"; reason: string }
  | { kind: "defer"; delayMs: number; reason: string }
  | { kind: "silence" };

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export class TriggerGate {
  private lastConsultAt = Number.NEGATIVE_INFINITY;
  private lastConsultedText: string | null = null;
  private wordsSinceConsult = 0;
  private pending = false;

  /** Evaluate one edit. Deferred results expect the harness to call back via
   *  `checkIdle` after `delayMs` (any newer edit supersedes the timer). */
  onEdit(prevText: string, text: string, now: number, isPaste = false): GateResult {
    const diff = classifyEdit(prevText, text);
    if (diff.editClass === "none") return { kind: "silence" };

    this.pending = true;

    // Count word *completions*, not keystrokes: a multi-char addition (paste,
    // autocomplete) contributes its word count; a single separator keystroke
    // after a word char completes one word.
    const windowEnd = diff.start + diff.added.length;
    const head = text.slice(0, windowEnd);
    if (diff.added.length > 3) {
      this.wordsSinceConsult += countWords(diff.added);
    } else if (/[\p{L}\p{N}]\s$/u.test(head)) {
      this.wordsSinceConsult += 1;
    }

    const trigger = this.detectTrigger(text, diff, isPaste);
    if (!trigger) {
      // No boundary crossed — idle backstop catches it if typing stops.
      return { kind: "defer", delayMs: IDLE_BACKSTOP_MS, reason: "idle backstop" };
    }
    if (trigger.deferMs) {
      return { kind: "defer", delayMs: trigger.deferMs, reason: trigger.reason };
    }
    return this.gatedConsult(now, trigger.reason);
  }

  private detectTrigger(
    text: string,
    diff: ReturnType<typeof classifyEdit>,
    isPaste: boolean,
  ): { reason: string; deferMs?: number } | null {
    if (isPaste && diff.added.length > PASTE_MIN_CHARS) {
      return { reason: "paste" };
    }
    // Deletions always matter, but wait out the backspace burst.
    if (diff.editClass === "delete" || diff.editClass === "replace") {
      return { reason: "deletion settled", deferMs: DELETE_SETTLE_MS };
    }

    // Everything below inspects the text up to the end of the changed window.
    const windowEnd = diff.start + diff.added.length;
    const head = text.slice(0, windowEnd);

    // Sentence boundary: . ! ? followed by space/end, or a newline landed.
    if (/[.!?](\s|$)$/.test(head) || diff.added.includes("\n")) {
      return { reason: "sentence boundary" };
    }
    // Clause boundary: , ; : — and closing ) " `
    if (/[,;:—)"`](\s|$)$/.test(head)) {
      return { reason: "clause boundary" };
    }
    // Reversal markers — highest-priority consult; check before connectives
    // ("no wait" would otherwise never match a single word).
    const tail = head.slice(-40).toLowerCase();
    for (const marker of REVERSAL_MARKERS) {
      if (new RegExp(`\\b${marker}[\\s.,;:!?]$`).test(tail)) {
        return { reason: `reversal marker: "${marker}"` };
      }
    }
    // Connective keyword completed as a whole word (separator just typed).
    const m = /([\p{L}']+)[\s.,;:!?]$/u.exec(head);
    if (m && CONNECTIVES.has(m[1].toLowerCase())) {
      return { reason: `connective: "${m[1].toLowerCase()}"` };
    }
    // Word burst backstop for long clauses with no punctuation.
    if (this.wordsSinceConsult >= WORD_BURST && /\s$/.test(head.slice(-1))) {
      return { reason: "word burst" };
    }
    return null;
  }

  /** Apply the consult floor: never twice within CONSULT_FLOOR_MS. */
  private gatedConsult(now: number, reason: string): GateResult {
    const elapsed = now - this.lastConsultAt;
    if (elapsed < CONSULT_FLOOR_MS) {
      return { kind: "defer", delayMs: CONSULT_FLOOR_MS - elapsed, reason };
    }
    return { kind: "consult", reason };
  }

  /** Timer callback for deferred triggers / idle backstop. */
  checkIdle(text: string, now: number): GateResult {
    if (!this.pending) return { kind: "silence" };
    if (this.lastConsultedText === text) return { kind: "silence" };
    return this.gatedConsult(now, "settled");
  }

  /** The harness reports an actually-dispatched consult; resets accumulation. */
  markConsulted(text: string, now: number): void {
    this.lastConsultAt = now;
    this.lastConsultedText = text;
    this.wordsSinceConsult = 0;
    this.pending = false;
  }

  /** Hash dedupe: nothing new since the last consult. */
  hasPendingChanges(text: string): boolean {
    return this.pending && this.lastConsultedText !== text;
  }
}
