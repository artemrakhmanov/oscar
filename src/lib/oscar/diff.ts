import type { ClassifiedDiff, EditClass } from "./types";

/**
 * Common-prefix/common-suffix diff + edit classification (pure, no model).
 * Yields exactly one changed window: old[start, start+removed.length) became
 * added. See docs/oscar-method.md § Edit classification.
 */

/** Changed window above this share of the larger text is a rewrite. */
const REWRITE_RATIO = 0.4;

export function classifyEdit(oldText: string, newText: string): ClassifiedDiff {
  if (oldText === newText) {
    return { editClass: "none", start: 0, removed: "", added: "" };
  }

  let prefix = 0;
  const max = Math.min(oldText.length, newText.length);
  while (prefix < max && oldText[prefix] === newText[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < max - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }

  const removed = oldText.slice(prefix, oldText.length - suffix);
  const added = newText.slice(prefix, newText.length - suffix);

  const editClass = classify(oldText, newText, prefix, removed, added);
  return { editClass, start: prefix, removed, added };
}

function classify(
  oldText: string,
  newText: string,
  start: number,
  removed: string,
  added: string,
): EditClass {
  // Full clear, or the changed window dwarfs the text → ledger reset.
  if (newText.length === 0) return "rewrite";
  const windowSize = Math.max(removed.length, added.length);
  const ratio = windowSize / Math.max(oldText.length, newText.length);
  if (oldText.length > 0 && ratio > REWRITE_RATIO) return "rewrite";

  if (removed.length === 0) {
    return start === oldText.length ? "append" : "insert";
  }
  if (added.length === 0) return "delete";
  return "replace";
}

/** True when the text ends mid-word (no trailing space/punctuation). */
export function endsMidWord(text: string): boolean {
  if (text.length === 0) return false;
  return /[\p{L}\p{N}]$/u.test(text);
}

/** The changed window ± `pad` chars of surrounding context, for the scout. */
export function diffWindow(newText: string, diff: ClassifiedDiff, pad = 80): string {
  const from = Math.max(0, diff.start - pad);
  const to = Math.min(newText.length, diff.start + diff.added.length + pad);
  return newText.slice(from, to);
}
