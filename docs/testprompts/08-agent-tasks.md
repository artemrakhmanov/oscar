# 08 — Agent tasks (dispatch queue)

Tests the preloading-magic layer: tasks are generated for ambiguities/risks, written as *real verbatim dispatches*, keyed by `triggeredBy`, and reshape as the ledger converges.

## A. Generation quality

Paste and settle:

```
Swap our feature-flag client for the new internal SDK. I don't know if the new
SDK supports percentage rollouts, and I'm worried the bootstrap is async now
which could flash the old UI on load.
```

Expect tasks triggered by the ambiguity (SDK rollout support) and the risk (async bootstrap flash). Read each task's prompt critically:
- Written as a real dispatch — second person, self-contained, pasteable into a fresh agent with no other context. "Check whether the SDK supports rollouts" *described as a plan* is a fail; "Search the SDK package for percentage-rollout APIs. Report: …" is a pass.
- Sensible `agentRole` (codebase-scout / docs-reader / impact-analyzer / convention-checker) and a one-line `expectedOutput`.

## B. Cancellation via resolution

From the settled state above, append:

```
 Checked the SDK readme — percentage rollouts are supported via the variants
API.
```

Expect: the ambiguity resolves → its task card is cancelled (struck through, fades) with **no model output about tasks needed** — cancellation falls out of the `remove` op. The risk's task survives untouched.

## C. Replacement via revision

Append something that changes the risk rather than resolving it:

```
 The flash concern is really only on the marketing pages, app pages render
behind auth anyway.
```

Expect: the risk item is revised; its task is *replaced* (keyed by `triggeredBy`), not duplicated alongside the old one. Queue should never show two tasks for the same item.

## D. Delta discipline

Across B and C, verify incremental runs emit tasks only for items added/revised in that run — the queue should never be wholesale re-emitted or reordered. Untouched tasks keep their position and identity.

## E. Full-rewrite flush

Select-all and replace with an unrelated prompt (see 06-C). Expect the entire queue to clear with the ledger, then repopulate from the new analysis.
