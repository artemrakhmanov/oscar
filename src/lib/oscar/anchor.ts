import type { Anchor, ClassifiedDiff, OscarItem } from "./types";

/**
 * Evidence anchoring — the load-bearing trick (docs/oscar-method.md § ledger).
 * Quotes are located exact → fuzzy → null; duplicates disambiguate by
 * proximity; anchors are maintained mechanically across every edit.
 */

/** Collect every occurrence of `needle` in `haystack` as anchors. */
function findAll(haystack: string, needle: string): Anchor[] {
  const out: Anchor[] = [];
  if (!needle) return out;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    out.push({ start: i, end: i + needle.length });
    i = haystack.indexOf(needle, i + 1);
  }
  return out;
}

/** Of several occurrences, pick the one nearest `near` (a text offset). */
function nearest(candidates: Anchor[], near: number | null): Anchor | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1 || near === null) return candidates[0];
  let best = candidates[0];
  let bestDist = Math.abs(best.start - near);
  for (const c of candidates.slice(1)) {
    const d = Math.abs(c.start - near);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Locate a verbatim quote in the text. `near` breaks ties between duplicate
 * occurrences (the item's previous anchor, or the changed window for new
 * items). Fallback chain: exact → case/whitespace-insensitive → null.
 */
export function locateEvidence(
  text: string,
  quote: string,
  near: number | null = null,
): Anchor | null {
  // Models love wrapping quotes in literal quote marks — strip them.
  const trimmed = quote.trim().replace(/^["'“”‘’`]+/, "").replace(/["'“”‘’`]+$/, "").trim();
  if (!trimmed) return null;

  const exact = nearest(findAll(text, trimmed), near);
  if (exact) return exact;

  // Case-insensitive pass.
  const ci = nearest(
    findAll(text.toLowerCase(), trimmed.toLowerCase()),
    near,
  );
  if (ci) return ci;

  // Whitespace-insensitive pass: any whitespace run matches any other.
  const escaped = trimmed
    .split(/\s+/)
    .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  try {
    const re = new RegExp(escaped, "gi");
    const candidates: Anchor[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      candidates.push({ start: m.index, end: m.index + m[0].length });
      re.lastIndex = m.index + 1;
    }
    return nearest(candidates, near);
  } catch {
    return null;
  }
}

export interface AnchorShiftResult {
  /** Items with anchors mechanically updated to the new text. */
  items: OscarItem[];
  /** Ids whose anchors overlapped a removed span (optimistically invalidated). */
  invalidatedIds: string[];
}

/**
 * Mechanical anchor maintenance for one classified edit:
 * anchors entirely before the window survive; anchors after shift by the
 * length delta; anchors overlapping a removed span invalidate their items.
 * Null anchors are exempt (re-grounded by the next analysis pass).
 */
export function shiftAnchors(
  items: OscarItem[],
  diff: ClassifiedDiff,
): AnchorShiftResult {
  const delta = diff.added.length - diff.removed.length;
  const removedEnd = diff.start + diff.removed.length;
  const invalidatedIds: string[] = [];

  const next = items.map((item) => {
    const a = item.anchor;
    if (!a) return item;

    // Entirely before the changed window.
    if (a.end <= diff.start) return item;

    // Entirely after the removed span — shift by the delta.
    if (a.start >= removedEnd) {
      return { ...item, anchor: { start: a.start + delta, end: a.end + delta } };
    }

    // Overlaps the window. A pure insertion strictly inside the anchor just
    // stretches it; any overlap with actually-removed text invalidates.
    if (diff.removed.length === 0) {
      return { ...item, anchor: { start: a.start, end: a.end + delta } };
    }

    invalidatedIds.push(item.id);
    return { ...item, anchor: null, status: "invalidated" as const };
  });

  return { items: next, invalidatedIds };
}
