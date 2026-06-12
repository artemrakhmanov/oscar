import { describe, expect, it } from "vitest";
import { locateEvidence, shiftAnchors } from "../anchor";
import { classifyEdit } from "../diff";
import type { OscarItem } from "../types";

function item(id: string, anchor: { start: number; end: number } | null): OscarItem {
  return {
    id,
    dimension: "constraints",
    content: { text: id },
    evidence: id,
    anchor,
    status: "confirmed",
    revision: 1,
  };
}

describe("locateEvidence", () => {
  const text = "Refactor the auth module but keep the public API surface identical";

  it("finds an exact quote", () => {
    const a = locateEvidence(text, "keep the public API surface");
    expect(a).toEqual({
      start: text.indexOf("keep the public API surface"),
      end: text.indexOf("keep the public API surface") + "keep the public API surface".length,
    });
  });

  it("disambiguates duplicate quotes by proximity, never blind indexOf", () => {
    const dup = "use the session store here and use the session store there";
    const near = dup.lastIndexOf("use the session store");
    const a = locateEvidence(dup, "use the session store", near);
    expect(a?.start).toBe(near);
    // Without a hint it falls back to the first occurrence.
    expect(locateEvidence(dup, "use the session store")?.start).toBe(0);
  });

  it("falls back to case-insensitive matching", () => {
    const a = locateEvidence(text, "Keep The Public API surface");
    expect(a?.start).toBe(text.indexOf("keep the public"));
  });

  it("falls back to whitespace-insensitive matching", () => {
    const spaced = "keep  the\n public   API surface";
    const a = locateEvidence(`prefix ${spaced} suffix`, "keep the public API surface");
    expect(a?.start).toBe("prefix ".length);
  });

  it("returns null when the model paraphrased", () => {
    expect(locateEvidence(text, "maintain backwards compatibility")).toBeNull();
  });
});

describe("shiftAnchors", () => {
  // old: "AAAA BBBB CCCC" — anchors on each block.
  const oldText = "AAAA BBBB CCCC";
  const items = [
    item("a", { start: 0, end: 4 }),
    item("b", { start: 5, end: 9 }),
    item("c", { start: 10, end: 14 }),
    item("nullAnchor", null),
  ];

  it("shifts anchors after an insertion; earlier anchors untouched", () => {
    const diff = classifyEdit(oldText, "AAAA XX BBBB CCCC");
    const { items: next, invalidatedIds } = shiftAnchors(items, diff);
    expect(invalidatedIds).toEqual([]);
    expect(next.find((i) => i.id === "a")?.anchor).toEqual({ start: 0, end: 4 });
    expect(next.find((i) => i.id === "c")?.anchor).toEqual({ start: 13, end: 17 });
  });

  it("invalidates items whose anchors overlap a removed span", () => {
    const diff = classifyEdit(oldText, "AAAA CCCC");
    const { items: next, invalidatedIds } = shiftAnchors(items, diff);
    expect(invalidatedIds).toEqual(["b"]);
    const b = next.find((i) => i.id === "b")!;
    expect(b.status).toBe("invalidated");
    expect(b.anchor).toBeNull();
  });

  it("leaves items outside the removed span untouched (delete-non-overlapping)", () => {
    const diff = classifyEdit(oldText, "AAAA CCCC");
    const { items: next } = shiftAnchors(items, diff);
    expect(next.find((i) => i.id === "a")?.status).toBe("confirmed");
    expect(next.find((i) => i.id === "c")?.status).toBe("confirmed");
    expect(next.find((i) => i.id === "c")?.anchor).toEqual({ start: 5, end: 9 });
  });

  it("stretches an anchor when text is inserted strictly inside it", () => {
    const diff = classifyEdit(oldText, "AAAA BBXXBB CCCC");
    const { items: next, invalidatedIds } = shiftAnchors(items, diff);
    expect(invalidatedIds).toEqual([]);
    expect(next.find((i) => i.id === "b")?.anchor).toEqual({ start: 5, end: 11 });
  });

  it("null anchors are exempt from invalidation", () => {
    const diff = classifyEdit(oldText, "AAAA CCCC");
    const { items: next } = shiftAnchors(items, diff);
    expect(next.find((i) => i.id === "nullAnchor")?.status).toBe("confirmed");
  });
});
