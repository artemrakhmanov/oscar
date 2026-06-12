# 09 — Edge cases & stress

Grab-bag of conditions that break naive harnesses.

## A. Below the floor

Type `fix bug` and stop.

Expect: nothing. Hard rule `< 15 chars → wait` fires before the gate. Add a few words to cross 15 chars and the first analysis should kick in on pause.

## B. Duplicate quotes (anchor disambiguation)

Paste:

```
Update the billing service to emit usage events. The billing service currently
batches writes; keep the batching. The billing service tests live in
services/billing/tests.
```

"The billing service" recurs three times. Check each item's highlight anchors to the *right* occurrence (nearest the item's context, never blind `indexOf` → always-first). Then delete the middle sentence and confirm only batching-anchored items grey.

## C. Evidence the model paraphrased

Hard to force deliberately, but watch for it everywhere: an item whose quote doesn't exist verbatim in the text gets `anchor: null` — it should render normally, never highlight, and survive deletes untouched until the next incremental pass re-grounds it. A null-anchored item that greys on an unrelated delete is a bug.

## D. Abort mid-stream

1. Paste a rich prompt (01-A) and the moment ops start streaming in, resume typing.

Expect: the in-flight fetch aborts; ops already applied stay applied; unexamined items show `stale` (visibly, honestly); within ~2s of stopping, the idle backstop triggers a follow-up run that heals everything. The drawer must never blank.

## E. Paste storm

Paste 01-A, then immediately paste 06-C's offsite prompt over it, then immediately paste 01-A again — three bulk changes inside a couple seconds.

Expect: stale-revision guard drops ops from superseded runs; the final settled drawer reflects only the last text. Symptom of failure: offsite items mixed into the auth-refactor analysis.

## F. Vague / non-task input

```
hmm thinking about whether we should even keep the legacy admin panel around,
it's a mess but people use it
```

Expect: graceful handling of musing rather than instruction — probably a soft objective, big ambiguities ("keep or kill?"), no invented constraints. Padding here means the terseness rule isn't holding.

## G. Non-engineering prompt

```
Write a warm but professional email declining the conference invite, and offer
a colleague as a replacement speaker without making it sound like a downgrade.
```

Expect: the dimensions still apply (O: decline + offer replacement; C: warm, professional, no-downgrade framing; A: which colleague?). Good check that prompts/dimensions aren't overfit to code tasks.

## H. Unicode & markdown

```
Rename the `useFetch` hook to `useQuery` — update all call-sites (≈ 40 files),
but don't touch the deprecated `useFetchLegacy` shim.
```

Expect: anchors land correctly despite backticks, em-dash, and `≈`; deleting the backticked clause greys the right item. Offset math over multi-byte chars is the thing under test.
