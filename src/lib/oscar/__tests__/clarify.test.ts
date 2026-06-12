import { describe, expect, it } from "vitest";
import {
  appendClarifications,
  attentionItems,
  formatClarifications,
  isAnswered,
  type ClarifyAnswer,
  type ClarifyQuestion,
} from "../clarify";
import type { OscarItem } from "../types";

const q = (id: string, question: string): ClarifyQuestion => ({
  id,
  itemId: `item-${id}`,
  question,
  options: ["a", "b"],
});

const answer = (
  question: ClarifyQuestion,
  option: string | null,
  freeform = "",
): ClarifyAnswer => ({ question, option, freeform });

describe("formatClarifications", () => {
  it("renders answered questions as plain statements", () => {
    const block = formatClarifications([
      answer(q("q1", "Where should API keys live?"), "X-Api-Key header"),
      answer(q("q2", "Which session store?"), null, "Redis, it's already deployed"),
    ]);
    expect(block).toBe(
      "Clarifications:\n" +
        "- Where should API keys live? X-Api-Key header\n" +
        "- Which session store? Redis, it's already deployed",
    );
  });

  it("combines option and freeform", () => {
    const block = formatClarifications([
      answer(q("q1", "Which store?"), "Redis", "but only for sessions"),
    ]);
    expect(block).toContain("Redis — but only for sessions");
  });

  it("skips unanswered questions; empty when nothing answered", () => {
    expect(formatClarifications([answer(q("q1", "A?"), null, "  ")])).toBe("");
    const block = formatClarifications([
      answer(q("q1", "A?"), null),
      answer(q("q2", "B?"), "yes"),
    ]);
    expect(block).not.toContain("A?");
    expect(block).toContain("B?");
  });

  it("isAnswered treats whitespace-only freeform as unanswered", () => {
    expect(isAnswered(answer(q("q1", "A?"), null, "   "))).toBe(false);
    expect(isAnswered(answer(q("q1", "A?"), "opt"))).toBe(true);
  });
});

describe("appendClarifications", () => {
  it("appends with a blank line, trimming trailing whitespace", () => {
    expect(appendClarifications("Do the thing.  \n", "Clarifications:\n- X? y")).toBe(
      "Do the thing.\n\nClarifications:\n- X? y",
    );
  });
  it("no-ops on an empty block", () => {
    expect(appendClarifications("text", "")).toBe("text");
  });
});

describe("attentionItems", () => {
  const item = (
    id: string,
    overrides: Partial<OscarItem>,
  ): OscarItem => ({
    id,
    dimension: "risks",
    content: { text: id, likelihood: "high" },
    evidence: id,
    anchor: null,
    status: "fresh",
    revision: 1,
    ...overrides,
  });

  it("keeps non-low severity, drops invalidated and low items", () => {
    const items = [
      item("high-risk", {}),
      item("invalidated", { status: "invalidated" }),
      item("low-objective", {
        dimension: "objectives",
        content: { text: "obj" },
      }),
    ];
    expect(attentionItems(items).map((i) => i.id)).toEqual(["high-risk"]);
  });
});
