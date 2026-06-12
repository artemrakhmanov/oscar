import { describe, expect, it } from "vitest";
import { classifyEdit, diffWindow, endsMidWord } from "../diff";

describe("classifyEdit", () => {
  it("classifies identical text as none", () => {
    expect(classifyEdit("abc", "abc").editClass).toBe("none");
  });

  it("classifies trailing addition as append", () => {
    const d = classifyEdit("Refactor the auth module", "Refactor the auth module to use sessions");
    expect(d.editClass).toBe("append");
    expect(d.added).toBe(" to use sessions");
    expect(d.removed).toBe("");
    expect(d.start).toBe("Refactor the auth module".length);
  });

  it("classifies mid-text addition as insert", () => {
    const d = classifyEdit("Refactor the module now", "Refactor the auth module now");
    expect(d.editClass).toBe("insert");
    expect(d.added).toContain("auth");
    expect(d.removed).toBe("");
  });

  it("classifies pure removal as delete with the right window", () => {
    const d = classifyEdit("keep the public API identical", "keep the API identical");
    expect(d.editClass).toBe("delete");
    expect(d.removed).toBe("public ");
    expect(d.added).toBe("");
    expect(d.start).toBe("keep the ".length);
  });

  it("classifies removal+addition in one window as replace", () => {
    const d = classifyEdit("use Redis for sessions", "use Postgres for sessions");
    expect(d.editClass).toBe("replace");
    // The trailing "s" is shared, so the minimal window is Redi→Postgre.
    expect(d.removed).toBe("Redi");
    expect(d.added).toBe("Postgre");
  });

  it("classifies a changed window over 40% of the text as rewrite", () => {
    const oldText = "Refactor the auth module to use the new session store";
    const newText = "Write a completely different program about cats and dogs please";
    expect(classifyEdit(oldText, newText).editClass).toBe("rewrite");
  });

  it("classifies a full clear as rewrite", () => {
    expect(classifyEdit("anything at all", "").editClass).toBe("rewrite");
  });

  it("small replace in a long text is not a rewrite", () => {
    const oldText =
      "Refactor the auth middleware to accept API keys while keeping the existing session-cookie flow working unchanged across all consumers.";
    const newText = oldText.replace("API keys", "bearer tokens");
    expect(classifyEdit(oldText, newText).editClass).toBe("replace");
  });
});

describe("endsMidWord", () => {
  it("detects a dangling word", () => {
    expect(endsMidWord("refactor the au")).toBe(true);
  });
  it("treats trailing space and punctuation as boundaries", () => {
    expect(endsMidWord("refactor the auth ")).toBe(false);
    expect(endsMidWord("refactor the auth.")).toBe(false);
    expect(endsMidWord("")).toBe(false);
  });
});

describe("diffWindow", () => {
  it("returns the changed window with surrounding context", () => {
    const oldText = "a".repeat(200);
    const newText = "a".repeat(100) + "NEW" + "a".repeat(100);
    const d = classifyEdit(oldText, newText);
    const w = diffWindow(newText, d, 10);
    expect(w).toContain("NEW");
    expect(w.length).toBeLessThanOrEqual(3 + 20 + 10);
  });
});
