# 01 — Full analysis (cold start)

Tests `mode: 'full'`: empty ledger, every op is an `add`, panels fill in O→S→C→A→R order.

## A. Rich prompt (all five dimensions should populate)

Paste in one go (paste > 20 chars triggers an immediate consult):

```
Refactor the auth module to use the new session store, but keep the public API
surface identical. Don't touch the admin routes — they're owned by another team
and mid-migration. This needs to ship before the Friday release cut, and we
can't take any new dependencies. I'm not sure if the session store supports
token rotation; if it doesn't, the refresh flow might silently break for
mobile clients.
```

Expect:
- **O**: refactor auth to new session store. **S**: auth module in, admin routes explicitly out. **C**: identical public API, Friday deadline, no new deps. **A**: does the store support token rotation? **R**: refresh flow breaking for mobile clients.
- Items stream in dimension order, each with a verbatim evidence quote that anchors (highlights) in the text.
- Dispatch queue shows agent tasks triggered by the ambiguity/risk (e.g. a codebase-scout checking the session store's interface).

## B. Sparse prompt (dimensions should stay honest, not pad)

```
Fix the flaky test in the payments suite.
```

Expect: 1–2 items total. No padding to fill empty dimensions — an empty Risks panel is correct here. Watch for the model inventing constraints that aren't in the text.

## C. Over-stuffed prompt (cap enforcement)

```
Build a CLI tool that syncs our Notion docs to the repo. It must be written in
Go, use only the standard library, run in under 5 seconds, work offline with a
cache, never overwrite local edits, log to stderr only, support a dry-run flag,
exit nonzero on conflicts, and read its config from the repo root. Don't sync
archived pages, don't follow external links, skip anything tagged draft, and
ignore the legacy workspace entirely.
```

Expect: way more than 4 candidate constraints/scope-exclusions exist. Verify **max 4 active items per dimension** holds (prompt rule + reducer backstop) and the model picked the most load-bearing ones.
