# 06 — Replace and rewrite

Tests the two heavier edit classes: replace (delete + insert in one window) and rewrite (>~40% changed → ledger reset, full re-analysis).

## A. Replace a clause in place

1. Paste and settle:

```
Write an integration test for the checkout flow using Playwright, running
against the staging environment.
```

2. Select "the staging environment" and type over it: `a local docker-compose stack`.

Expect:
- The instant the selection is replaced, the staging-anchored item greys (delete semantics on the old span).
- The incremental run revises it to docker-compose (insert semantics on the new text). Items not anchored to that clause (Playwright, checkout flow) don't move.

## B. Replace that changes the objective

1. Settle on:

```
Write a script to backfill the missing avatar URLs in the users table.
```

2. Select "backfill the missing avatar URLs" and replace with `delete all orphaned rows`.

Expect: this guts the objective. Scout may escalate to `full` even though the char delta is modest — the *meaning* delta is total. Either way the drawer must end up describing deletion, not backfill, with no zombie backfill items.

## C. Full rewrite (ledger reset)

1. Settle on any prompt from scenario 01.
2. Select all, delete, and paste something unrelated:

```
Plan the Q3 offsite: 3 days, 40 people, somewhere reachable by train from
Berlin, budget 30k. Find venues with workshop rooms.
```

Expect: edit class `rewrite` → hard rule forces `full` (no scout needed). Ledger resets; the drawer empties and refills from scratch — this is the one legitimate case of a full repaint. Old agent tasks all disappear.

## D. Borderline rewrite (~40% threshold)

Settle on a 3-sentence prompt, then select and rewrite roughly one and a half sentences. This sits near the threshold — note which way it classifies and whether the result feels right (a too-eager rewrite nukes good items; too-lazy incremental drags stale ones along).
