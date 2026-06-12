# 04 — Delete → optimistic invalidation

Tests the anchor machinery: deleting text must grey out overlapping items *in the same frame* (pure code, before any API call), and the follow-up incremental run settles them.

## A. Delete an item's evidence

1. Paste and settle:

```
Migrate the user service to the new ORM. Keep backwards compatibility with the
v1 REST clients. The mobile team needs this done before their next release.
```

2. Find the item anchored to "Keep backwards compatibility with the v1 REST clients" and select-delete that whole sentence.

Expect, in order:
- **Instantly** (same keystroke, no network): the compat item greys out (invalidated). This is the optimistic-invalidation frame — if there's any network-latency delay before the grey, the pure-code path isn't doing its job.
- After the 500ms deletion-settle pause: scout consult → incremental run → the item is removed for good (its evidence no longer exists).

## B. Delete that does NOT overlap any anchor

From the same settled prompt, delete a filler word that no evidence quote covers (e.g. just the word "next" in "their next release", if no quote anchors it — check highlights first).

Expect: anchors after the deletion shift left by the delta; **nothing** greys out. Items survive untouched. If unrelated items flicker or grey, anchor-shift math is off.

## C. Backspace burst (settle timing)

1. Settle on:

```
Add dark mode support to the settings page and the onboarding flow.
```

2. Hold backspace and erase "and the onboarding flow" character by character.

Expect: no scout consults *during* the burst (deletions wait out a 500ms pause). The scope item covering onboarding greys progressively or once the overlap is hit, then one consult after you stop — not one per backspace.

## D. Delete then immediately retype

Delete a sentence, watch its item grey, then retype roughly the same sentence before the analysis lands.

Expect: this is the racing case — the in-flight run is aborted/superseded, and the item either gets re-justified (back to normal) or replaced by an equivalent. The invariant: it never sticks as permanently invalidated while its evidence is back in the text. The idle backstop (~2s) should self-heal any stale leftovers.
