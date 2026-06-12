# 07 — Scout & trigger gate behavior

Tests *when* things fire, not what they conclude. Best run with the network tab or dev logging open so you can count scout consults and analysis runs.

## A. Mid-word silence

Type slowly, character by character:

```
Implement pagina
```

Expect: zero scout consults while mid-word ("pagina" — hard rule: append ending mid-word → wait, and `< 15 chars` never reaches the gate at the start). Finish the word and sentence:

```
tion for the audit log.
```

Expect: a consult at the sentence boundary (`.` + end). A typical sentence should produce 2–4 consults total (connectives, word-burst backstop, final boundary) — not one per keystroke.

## B. Connective keywords

Type, pausing briefly after each marked word:

```
Export the report as PDF and email it to the account owner, but only for
enterprise plans, and never include draft line items.
```

Expect consults to land right after completing `and`, `but`, `only`, `never`, and at the `,`/`.` boundaries. Watch the `reason` status line update at each — it's the visible heartbeat.

## C. Reversal markers (highest-priority consult)

Continue any settled prompt with:

```
 no wait, scratch that —
```

Expect: consult fires the moment a reversal marker completes, even mid-thought, because appended text is about to invalidate earlier judgements. The verdict here may still be `wait`/`midThought: true` (the dash dangles) — firing and deciding-to-wait are both correct; *not consulting* is the bug.

## D. Word burst without punctuation

Type a long unpunctuated run:

```
make the import job retry failed rows with exponential backoff up to five
times before moving them to a dead letter table
```

Expect: the ≥6-new-words backstop produces periodic consults even though no punctuation lands until... never. The 2s idle backstop should catch the final unterminated clause after you stop.

## E. Coalescing and floor

Type a fast burst crossing several boundaries (paste-speed typing if you can):

Expect: no two consults within ~500ms; triggers that land while one consult is in flight coalesce into the latest state; an arriving verdict is discarded if a newer consult was dispatched. Symptom of failure: drawer reacting to *old* text, or `reason` lines arriving out of order.

## F. Scout unavailable (failure semantics)

If you have a dev toggle or can block `/api/oscar/scout`: kill the scout and repeat scenario 02.

Expect: 250ms timeout race → local rules decide (append → incremental). Everything still works, just less cleverly — the scout is an optimization, never a dependency. The harness must not hang or error visibly.
