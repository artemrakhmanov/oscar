# 05 — Ambiguity resolution (the money shot)

Tests the demo's signature moment: the user types a clause that answers an open question, and the ambiguity dissolves in **A** while the answer materializes in **S**/**C** — the contract visibly converging.

## A. Resolve a "which one?" ambiguity

1. Paste and settle:

```
Refactor the auth module to use the new session store.
```

Expect an ambiguity like *"which session store is 'the new' one?"* (and likely a codebase-scout agent task triggered by it).

2. Type the answer:

```
 The new store is the RedisSessionStore in packages/session — the one the
checkout service already uses.
```

Expect:
- The ambiguity is `remove`d with reason ~"resolved by edit" — it visibly dissolves, not just greys.
- The answer lands as a new scope/constraint item.
- The agent task that the ambiguity triggered is **cancelled** in the dispatch queue (struck through / fades) — cancellation falls out of the ledger op, no model output needed.

## B. Resolve a risk

1. Settle on:

```
Bump the payment SDK to v4. I think the webhook signature format changed
between versions but I'm not certain.
```

2. Append:

```
 Confirmed with their changelog: signatures are unchanged, only the retry
headers moved.
```

Expect: the uncertainty item resolves; a small factual item may replace it. Watch that *unrelated* items don't get touched in the same pass.

## C. Resolution that spawns a new question

1. Settle on:

```
Add CSV import for contacts.
```

2. Append:

```
 Use the same parser as the deals importer.
```

Expect: any "which parser / what format?" ambiguity resolves, but a reasonable harness may add a *new* one (does the deals parser handle the contacts column set?). Resolution isn't always net-negative on ambiguities — check the swap reads coherent, not churny.
