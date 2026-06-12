# 03 — Append that contradicts / supersedes

Tests that "additive by default" is not immunity: an append can kill or revise earlier judgements even though their evidence text is still present. Also exercises the scout's `contradicts` output and reversal-marker triggers.

## A. Explicit reversal marker

1. Paste and settle:

```
Cache the search results in Redis with a 10 minute TTL.
```

2. Type the reversal (the word "actually" should trigger a scout consult on its own):

```
 Actually, use Postgres materialized views instead — ops doesn't want another
service to babysit.
```

Expect:
- Scout fires on `actually`/`instead`, returns non-empty `contradicts` pointing at the Redis item(s) → forced incremental, never `wait`.
- The Redis objective/constraint gets `revise`d (or removed with reason "superseded by edit") even though "Cache the search results in Redis" is still literally in the text.
- A new item reflects Postgres materialized views. The ops constraint ("no new service") lands in Constraints.

## B. Quiet contradiction (no marker keywords)

1. Paste and settle:

```
The migration script should run against all tenant databases in parallel.
```

2. Append — note there's no "actually/instead", so this tests the scout spotting the clash from the ledger digest alone:

```
 Run the tenants one at a time, we got burned by connection pool exhaustion
last quarter.
```

Expect: "in parallel" item revised to sequential. If it survives untouched, the scout missed the contradiction and the additive default wrongly protected it — the exact failure the `contradicts` channel exists for.

## C. Partial supersede

Base:

```
Support exporting reports as PDF, CSV, and XLSX.
```

Append:

```
 Skip XLSX for now, it's blocked on the licensing question.
```

Expect: the export item is *revised* (scope narrowed), not removed — prefer `revise` over remove+add when the judgement evolved. Possibly a new ambiguity/risk about the licensing question, plus its agent task.
