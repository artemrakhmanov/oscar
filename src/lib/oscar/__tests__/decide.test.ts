import { describe, expect, it } from "vitest";
import { classifyEdit } from "../diff";
import { decide, fallbackDecision, hardDecision } from "../decide";
import type { ScoutVerdict } from "../types";

const LONG = "Refactor the auth module to use the new session store";

function verdict(partial: Partial<ScoutVerdict>): ScoutVerdict {
  return {
    action: "incremental",
    reason: "test",
    affectedDimensions: [],
    midThought: false,
    contradicts: [],
    ...partial,
  };
}

describe("hardDecision", () => {
  it("waits below the minimum analyzable length", () => {
    expect(
      hardDecision({ text: "hi there", diff: classifyEdit("", "hi there"), ledgerEmpty: true }),
    ).toBe("wait");
  });

  it("skips when nothing changed", () => {
    expect(
      hardDecision({ text: LONG, diff: classifyEdit(LONG, LONG), ledgerEmpty: false }),
    ).toBe("skip");
  });

  it("goes full on rewrite", () => {
    const diff = classifyEdit(LONG, "Write docs for the billing system instead of code");
    expect(hardDecision({ text: "Write docs for the billing system instead of code", diff, ledgerEmpty: false })).toBe("full");
  });

  it("goes full when the ledger is empty", () => {
    const text = LONG + " now";
    expect(
      hardDecision({ text, diff: classifyEdit(LONG, text), ledgerEmpty: true }),
    ).toBe("full");
  });

  it("waits on an append that ends mid-word", () => {
    const text = LONG + " and migra";
    expect(
      hardDecision({ text, diff: classifyEdit(LONG, text), ledgerEmpty: false }),
    ).toBe("wait");
  });

  it("defers to the scout otherwise", () => {
    const text = LONG + " carefully. ";
    expect(
      hardDecision({ text, diff: classifyEdit(LONG, text), ledgerEmpty: false }),
    ).toBeNull();
  });
});

describe("decide", () => {
  const text = LONG + " carefully. ";
  const diff = classifyEdit(LONG, text);

  it("obeys the scout verdict when no hard rule applies", () => {
    expect(decide({ text, diff, ledgerEmpty: false, verdict: verdict({ action: "wait" }) })).toBe("wait");
    expect(decide({ text, diff, ledgerEmpty: false, verdict: verdict({ action: "full" }) })).toBe("full");
  });

  it("a non-empty contradicts list forces incremental over wait", () => {
    expect(
      decide({
        text,
        diff,
        ledgerEmpty: false,
        verdict: verdict({ action: "wait", contradicts: ["obj-1"] }),
      }),
    ).toBe("incremental");
  });

  it("falls back by edit class when the scout times out", () => {
    expect(decide({ text, diff, ledgerEmpty: false, verdict: null })).toBe("incremental");
    expect(fallbackDecision(classifyEdit(LONG, "totally different thing entirely"))).toBe("full");
  });

  it("hard rules outrank the verdict", () => {
    const midWord = LONG + " migra";
    expect(
      decide({
        text: midWord,
        diff: classifyEdit(LONG, midWord),
        ledgerEmpty: false,
        verdict: verdict({ action: "full" }),
      }),
    ).toBe("wait");
  });
});
