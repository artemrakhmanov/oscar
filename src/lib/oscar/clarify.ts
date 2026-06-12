import type { OscarItem } from "./types";
import { displayItem } from "./dimensions";

/**
 * The clarify flow: "fix" turns attention points into concrete questions
 * (options + free-form), and committed answers become a formatted
 * clarification block appended to the prompt — which the harness then
 * re-analyzes, dissolving the points that raised the questions.
 */

export interface ClarifyQuestion {
  id: string;
  /** Ledger item id this question would resolve. */
  itemId: string;
  question: string;
  /** 2–4 concrete answer options; free-form is always also allowed. */
  options: string[];
}

export interface ClarifyAnswer {
  question: ClarifyQuestion;
  /** Selected option, if any. */
  option: string | null;
  /** Free-form input; combinable with an option. */
  freeform: string;
}

/** What the clarify endpoint receives: the prompt + attention digest. */
export interface ClarifyRequest {
  prompt: string;
  items: {
    id: string;
    dimension: string;
    summary: string;
    severity: string;
    evidence: string;
  }[];
}

/** An answer counts when the user picked an option or typed something. */
export function isAnswered(a: ClarifyAnswer): boolean {
  return a.option !== null || a.freeform.trim().length > 0;
}

function renderAnswer(a: ClarifyAnswer): string {
  const free = a.freeform.trim();
  if (a.option && free) return `${a.option} — ${free}`;
  return a.option ?? free;
}

/**
 * Format committed answers as the block appended to the prompt. Reads as
 * something the user could have typed themselves — plain statements the
 * incremental analysis can anchor evidence to.
 */
export function formatClarifications(answers: ClarifyAnswer[]): string {
  const answered = answers.filter(isAnswered);
  if (answered.length === 0) return "";
  const lines = answered.map(
    (a) => `- ${a.question.question} ${renderAnswer(a)}`,
  );
  return `Clarifications:\n${lines.join("\n")}`;
}

/** Append the clarification block to the prompt text (idempotent spacing). */
export function appendClarifications(text: string, block: string): string {
  if (!block) return text;
  const base = text.replace(/\s+$/, "");
  return base.length > 0 ? `${base}\n\n${block}` : block;
}

/** The attention items the clarify endpoint should ask about. */
export function attentionItems(items: OscarItem[]): OscarItem[] {
  return items.filter(
    (i) => i.status !== "invalidated" && displayItem(i).severity !== "low",
  );
}
