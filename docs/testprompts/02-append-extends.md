# 02 — Append that extends (additive, no churn)

Tests the core anti-churn promise: appended text that doesn't contradict anything must leave existing items byte-for-byte untouched (silence or `confirm`, never reword/reorder).

## Steps

1. Paste the base prompt and let the full analysis settle:

```
Add rate limiting to the public API endpoints.
```

2. Note the exact wording and order of every drawer item. Then type (don't paste) an additive continuation:

```
 Use a sliding window of 100 requests per minute per API key.
```

Expect: an incremental run (scout should say something like "append adds a constraint"). One or two **new** items appear in Constraints; every pre-existing item keeps its exact text, position, and status. No drawer-wide repaint.

3. Append another additive clause:

```
 Return a 429 with a Retry-After header when the limit is hit.
```

Expect: same again — adds only. If the objective item ("add rate limiting…") gets reworded or re-ordered at any point, that's the churn failure mode the ledger exists to prevent.

## What to watch

- The scout `reason` line at each sentence boundary — it should classify these as additive, `affectedDimensions: ['constraints']`-ish.
- Mid-sentence (after typing "Use a sliding window of") nothing should fire except possibly a scout consult that returns `wait`/`midThought: true`.
