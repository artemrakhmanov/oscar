import { describe, expect, it } from "vitest";
import {
  CONSULT_FLOOR_MS,
  DELETE_SETTLE_MS,
  IDLE_BACKSTOP_MS,
  TriggerGate,
} from "../gate";

/** Type one character at a time from `from` to `to`, returning each result. */
function typeOut(gate: TriggerGate, base: string, addition: string, startAt = 1000) {
  const results = [];
  let text = base;
  let now = startAt;
  for (const ch of addition) {
    const prev = text;
    text = text + ch;
    now += 100;
    results.push({ text, now, result: gate.onEdit(prev, text, now) });
  }
  return results;
}

describe("TriggerGate", () => {
  it("is silent (idle-deferred) on mid-word keystrokes", () => {
    const gate = new TriggerGate();
    const results = typeOut(gate, "", "refac");
    for (const r of results) {
      expect(r.result.kind).toBe("defer");
      if (r.result.kind === "defer") {
        expect(r.result.delayMs).toBe(IDLE_BACKSTOP_MS);
      }
    }
  });

  it("fires on a sentence boundary", () => {
    const gate = new TriggerGate();
    const r = gate.onEdit("Refactor the auth module", "Refactor the auth module.", 1000);
    expect(r).toEqual({ kind: "consult", reason: "sentence boundary" });
  });

  it("fires on Enter (newline)", () => {
    const gate = new TriggerGate();
    const r = gate.onEdit("line one", "line one\n", 1000);
    expect(r.kind).toBe("consult");
  });

  it("fires on a clause boundary", () => {
    const gate = new TriggerGate();
    const r = gate.onEdit("keep the API stable", "keep the API stable,", 1000);
    expect(r).toEqual({ kind: "consult", reason: "clause boundary" });
  });

  it("fires when a connective keyword completes as a whole word", () => {
    const gate = new TriggerGate();
    const r = gate.onEdit("do this but", "do this but ", 1000);
    expect(r).toEqual({ kind: "consult", reason: 'connective: "but"' });
  });

  it("does not fire on words merely containing a connective", () => {
    const gate = new TriggerGate();
    // "android " ends with "d " — not the whole word "and".
    const r = gate.onEdit("port it to androi", "port it to android ", 1000);
    expect(r.kind).toBe("defer");
  });

  it("fires on a reversal marker", () => {
    const gate = new TriggerGate();
    const r = gate.onEdit("use Redis. actually", "use Redis. actually ", 1000);
    expect(r.kind).toBe("consult");
    if (r.kind === "consult") expect(r.reason).toContain("actually");
  });

  it("fires a word burst after 6 unconsulted words at a word boundary", () => {
    const gate = new TriggerGate();
    const results = typeOut(gate, "", "one two three four five six ");
    const consults = results.filter((r) => r.result.kind === "consult");
    expect(consults.length).toBeGreaterThan(0);
    const first = consults[0];
    expect(first.result).toEqual({ kind: "consult", reason: "word burst" });
  });

  it("defers deletions by the settle window", () => {
    const gate = new TriggerGate();
    const r = gate.onEdit("keep the public API", "keep the API", 1000);
    expect(r).toEqual({
      kind: "defer",
      delayMs: DELETE_SETTLE_MS,
      reason: "deletion settled",
    });
  });

  it("fires immediately on a large paste", () => {
    const gate = new TriggerGate();
    const r = gate.onEdit("", "Refactor the entire auth module today", 1000, true);
    expect(r).toEqual({ kind: "consult", reason: "paste" });
  });

  it("enforces the consult floor and coalesces", () => {
    const gate = new TriggerGate();
    expect(gate.onEdit("a sentence lands", "a sentence lands.", 1000).kind).toBe("consult");
    gate.markConsulted("a sentence lands.", 1000);
    const r = gate.onEdit("a sentence lands.", "a sentence lands. More,", 1200);
    expect(r.kind).toBe("defer");
    if (r.kind === "defer") expect(r.delayMs).toBe(CONSULT_FLOOR_MS - 200);
  });

  it("checkIdle consults only when unconsulted changes are pending", () => {
    const gate = new TriggerGate();
    gate.onEdit("", "hello", 1000);
    expect(gate.checkIdle("hello", 4000).kind).toBe("consult");
    gate.markConsulted("hello", 4000);
    // Hash dedupe: same text again → silence.
    expect(gate.checkIdle("hello", 9000).kind).toBe("silence");
    expect(gate.hasPendingChanges("hello")).toBe(false);
  });
});
