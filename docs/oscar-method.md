# OSCAR — The Analysis Method (`/api/oscar`)

Deep spec for the analysis harness: when we call the model, with which prompts, how results survive an ever-changing input, and how the "background research agents" are mocked. Companion to [tech-spec.md](./tech-spec.md); this doc owns everything between the keystroke and the drawer.

## The core problem

The prompt is not a document — it's an **ever-updating input**. A naive harness re-analyzes the full text on every pause, which has two failure modes:

1. **Visual churn.** A full re-analysis replaces the entire drawer. Items the user already read jump, reorder, or get reworded for no reason. The drawer stops feeling like a stable contract and starts feeling like a slot machine.
2. **Wrong semantics.** Edits have meaning. *Appending* words is additive by default — existing judgements should survive untouched unless the new text **contradicts or supersedes** them ("…actually, use Postgres instead" is an append that kills the Redis judgement). *Deleting* words can invalidate judgements that were anchored to the deleted text. *Rewriting* a clause changes the contract. A harness that can't tell these apart can't be a comprehension mirror.

So the unit of state is not "the analysis" — it's the **ledger**: a persistent set of judgement items that the model *edits* over time, the same way the user edits their prompt.

## The ledger

Client-held state, the single source of truth the drawer renders from:

```ts
type OscarItem = {
  id: string                      // model-assigned, stable across revisions
  dimension: 'objectives' | 'scope' | 'constraints' | 'ambiguities' | 'risks'
  content: DimensionContent       // per-dimension payload (see tech-spec schema shapes)
  evidence: string                // short verbatim quote from the prompt that justifies this item
  anchor: { start: number; end: number } | null   // evidence located in the text (client-computed)
  status: 'fresh' | 'confirmed' | 'stale' | 'invalidated'
  revision: number                // analysis revision that last touched it
}

type Ledger = {
  items: OscarItem[]
  analyzedText: string            // the exact text the ledger reflects
  revision: number
}
```

**Evidence anchoring is the load-bearing trick.** Every item carries a verbatim quote from the prompt. The client locates the quote in the text (`indexOf`, fuzzy fallback) to get a span. That span is what makes deletion semantics computable: when text is deleted, we know *exactly* which judgements lost their justification — locally, instantly, before any model call.

## Edit classification (pure code, no model)

On every keystroke pause, diff `ledger.analyzedText` against the current text via common-prefix/common-suffix comparison. This yields one changed window and a classification:

| Edit class | Detection | Semantics |
|---|---|---|
| **append** | old text is a prefix of new text | Additive by default — but new text can contradict or supersede earlier statements, so every ledger item remains eligible for `revise`/`remove`. The default protects against churn, not against correction. |
| **insert** | change window is an addition mid-text | Same semantics as append; may also refine items whose anchors neighbor the window. |
| **delete** | change window is a removal | Invalidates items whose anchors overlap the removed span. |
| **replace** | removal + addition in one window | Delete semantics on the old span + insert semantics on the new text. |
| **rewrite** | changed window > ~40% of text, or full clear | Ledger reset; full re-analysis. |

Anchor maintenance is mechanical: anchors after the change window shift by the length delta; anchors overlapping a removed span mark their items **invalidated**; everything else survives untouched.

**Optimistic invalidation:** the moment a delete is classified, the client greys out the overlapping items *immediately* — before any API call. The user sees OSCAR react to the deletion in the same frame they make it. The model call that follows merely settles the question (gone for good, or re-justified by what remains).

## The scout — the always-on guide agent

A tiny triage agent guides the harness: it decides what an edit *means* and what work it warrants. "Always-on" describes its **availability**, not its firing rate — it must never fire per keystroke. A deterministic **trigger gate** (pure code, zero cost, runs on every keystroke) decides whether the scout is even consulted.

### The trigger gate (deterministic, no model)

The scout fires only when the edit crosses a semantic boundary:

| Trigger | Examples | Rationale |
|---|---|---|
| Sentence boundary | `.` `!` `?` followed by space/end, newline / Enter | A complete thought just landed — the highest-signal moment. |
| Clause boundary | `,` `;` `:` `—`, closing `)` `"` `` ` `` | A sub-thought closed; scope/constraint clauses often live here. |
| Connective keyword completed | `and`, `or`, `but`, `not`, `except`, `without`, `instead`, `unless`, `only`, `also`, `then`, `don't`, `never`, `must`, `should` | These words *announce* a constraint, alternative, or negation — exactly what changes OSCAR's judgements. Matched as whole words (trailing space/punctuation typed). |
| Reversal marker completed | `actually`, `no wait`, `scratch that`, `forget`, `rather`, `on second thought` | The user is contradicting something they already wrote — appended text is about to *invalidate* earlier judgements, the highest-priority consult there is. |
| Word burst | ≥ 6 new words since the last scout consult, at a word boundary | Backstop for long clauses with no punctuation. |
| Deletion settled | any delete/replace, after a 500ms pause | Deletions always matter (invalidation) — but wait out backspace bursts; firing mid-backspace is noise. |
| Paste | paste event > ~20 chars | Bulk change, classify immediately. |
| Idle backstop | 2s pause with unconsulted changes pending | Catches text that never hit a boundary. |

Everything else — mid-word keystrokes, cursor movement, a backspace streak in progress — is **silence**. The gate also enforces a floor (don't consult twice within ~500ms; coalesce into the latest state) and dedupes by hash. Heuristic order: hard rules below run *before* the gate, so e.g. `< 15 chars` never reaches it.

### The scout call itself

- **Model:** `gpt-5-nano`, ~150 output tokens, JSON mode. Fired only by the gate above, so call volume tracks *thought boundaries*, not typing speed.
- **Transport:** plain route handler `POST /api/oscar/scout` — *not* a workflow. Scout calls are disposable by design (an obsolete scout opinion is worthless); durability would be waste.
- **Input:** the classified diff (edit class + changed window ± 80 chars of context), a one-line-per-item digest of the ledger, chars since last analysis.
- **Output:**

```ts
type ScoutVerdict = {
  action: 'wait' | 'incremental' | 'full'
  reason: string                        // surfaced in the UI as OSCAR's "inner monologue"
  affectedDimensions: Dimension[]       // hint passed into the incremental prompt
  midThought: boolean                   // user appears mid-sentence/mid-word
  contradicts: string[]                 // ledger item ids the new text appears to contradict/supersede
}
```

`contradicts` is the scout's second job: it sees the ledger digest next to the new text, so it can spot that an append clashes with an existing judgement even when the gate keywords didn't fire. A non-empty `contradicts` forces an incremental run (never `wait`) and is passed into the analysis prompt alongside `hint`, so the main model knows which items to re-examine first.

The scout is what makes the harness feel intelligent rather than timer-driven: it can say "user is mid-sentence, wait" (trailing comma, dangling conjunction), "this append only touches scope", or "this rewrite changed the actual objective — go full". Its `reason` string streams into the UI as a status line under the drawer — the visible heartbeat of the always-on agent.

**The scout advises; code decides.** Local rules can override it and act as fallback when it's slow or down:

```
hard rules (no model needed):
  text < 15 chars                          → wait
  hash unchanged                           → skip
  edit class = rewrite                     → full
  edit class = append AND ends mid-word    → wait
scout verdict (raced with 250ms timeout):
  scout says wait/incremental/full         → obey
  scout timed out                          → append/insert/delete → incremental; else full
```

## The main analysis — `POST /api/oscar`

One endpoint, two modes, one durable workflow (`oscarWorkflow`). The route handler starts the run and returns `run.readable` (see tech-spec for the workflow/streaming mechanics).

```
POST /api/oscar
body: {
  prompt: string                  // full current text (always sent — it's small)
  context?: string                // mocked workspace context
  mode: 'full' | 'incremental'
  ledger?: LedgerDigest           // incremental only: items as the model last knew them
  diff?: ClassifiedDiff           // incremental only: edit class + windows
  hint?: Dimension[]              // scout's affectedDimensions
}
```

### Output contract: operations, not snapshots

The model never returns "the analysis" — it returns **operations against the ledger**:

```ts
{
  operations: [
    { op: 'add',        dimension, item: { id, content, evidence } },
    { op: 'revise',     id, content, evidence },     // meaning changed — re-anchor
    { op: 'confirm',    id },                        // still holds after the edit
    { op: 'remove',     id, reason },                // no longer justified by the text
  ],
  agentTasks: [ ... ]   // see "Preloading magic" below
}
```

- `full` mode is just the degenerate case: every operation is an `add` against an empty ledger. One contract, one schema, one client code path.
- The workflow step runs `streamObject` with this schema; operations stream in one by one and the client **reducer** applies each to the ledger as it lands. Items pop, grey, or firm up individually — no drawer-wide repaint, ever.
- The reducer ignores ops referencing unknown ids and drops ops arriving from a stale revision (guard: each run is tagged with the revision it analyzed).

### Prompt templates (`src/lib/oscar/prompts.ts`)

**Shared system core** (both modes): the five dimension definitions with the Scope/Constraints split (*Scope = blast radius; Constraints = rules the work must obey*), terseness rules ("max 4 items per dimension, no padding"), and the evidence rule: *every item must carry a short verbatim quote from the prompt as `evidence` — if you cannot quote it, you may not claim it.*

**Full mode** adds:

> Analyze the prompt from scratch. Emit only `add` operations. Order them O→S→C→A→R so the interface fills in sequence.

**Incremental mode** adds the ledger and the diff, rendered for the model as an annotated edit, and the contract for edit semantics:

> Here is your previous analysis (the ledger) and what the user changed:
>
> ```
> UNCHANGED  Refactor the auth module to use the new session store
> ADDED     +but keep the public API surface identical
> ```
>
> Rules:
> - Appended or inserted text ADDS understanding by default. Do not rewrite, reword, or reorder items the edit does not touch — `confirm` them or stay silent.
> - The default is not immunity: if the new text **contradicts, negates, or supersedes** an earlier statement, `revise` the affected item (or `remove` it, reason: "superseded by edit") even though its evidence text is still present. Reversal markers — "actually", "instead", "no wait", "scratch that", "but", "on second thought" — usually signal this.
> - Otherwise `remove` an item only if its evidence no longer exists in the prompt. Prefer `revise` over remove+add when the judgement evolved.
> - Resolve before you add: if new text answers an open ambiguity, `remove` it (reason: "resolved by edit") — and add the answer where it now belongs (usually scope or constraints).
> - Focus on dimensions hinted as affected: {hint}. Touch others only if the edit plainly impacts them.

That third rule is the demo's money shot: the user types an ambiguity-resolving clause and watches the question in **A** dissolve while a new rail appears in **S** — the contract visibly converging as they type.

### Workflow shape

```
oscarWorkflow(input)                    'use workflow'
  └─ analyzeStep(input)                 'use step' — streamObject (gpt-5-mini),
                                         pipe partial ops+tasks into getWritable()
```

One step for v1 — retries and stream resumability come from the workflow envelope (per tech-spec). If `agentTasks` generation ever degrades the ops latency, split it into a second step writing to the same stream after ops complete; not for v1.

## Preloading magic — mocked research-agent prompts

The pitch is *"OSCAR starts working before you hit send."* The drawer proves comprehension; **agent tasks** prove *initiative*. Alongside the operations, the model drafts the exact prompts that background research agents *would* receive right now if dispatch were real:

```ts
type AgentTask = {
  id: string
  triggeredBy: string             // ledger item id (usually an ambiguity or risk)
  agentRole: 'codebase-scout' | 'docs-reader' | 'impact-analyzer' | 'convention-checker'
  prompt: string                  // the EXACT prompt that agent would receive — written
                                  // as a real dispatch, not a description of one
  expectedOutput: string          // one line: what it would report back
}
```

Prompt rule for task generation: *write the dispatch verbatim, second person, self-contained — as if pasted into a fresh agent with no other context.* E.g. triggered by the ambiguity "which session store?":

> **codebase-scout** — "Search this repository for existing session-store implementations and their consumers. Report: module paths, the interface each exposes, and which one the auth module currently imports. Do not modify anything."

The UI renders these as a **dispatch queue** beneath the drawer — queued cards with role badges and a pulsing "would dispatch on send" state. Tasks are ledger-coupled: when the item that triggered a task is removed or resolved, its card is cancelled (struck through, fades) — the queue visibly reshapes as the prompt converges, which *is* the preloading-magic demo.

### Demo fixtures (`src/lib/oscar/fixtures.ts`)

Live generation can flake on stage. For the scripted demo, keep canned ledgers + agent tasks for 2–3 rehearsed prompts, keyed by text hash. When the composer text matches a fixture hash, the harness replays the fixture through the same reducer with realistic stagger timings instead of calling the API. Same rendering path, zero live risk, and the demo can run offline. A visible dev toggle (`live | fixtures`) keeps us honest.

## Call cadence — full picture

```
keystroke
  ├─ 0ms        anchors shift; deletes → optimistic invalidation (pure code)
  ├─ gate       trigger gate evaluates (pure code): boundary crossed?
  │               no  → silence; gate keeps accumulating
  │               yes → scout consult (plain route, gpt-5-nano) → verdict + visible reason
  └─ ~700ms     on pause, harness decides (hard rules + latest verdict):
                  wait        → do nothing, gate keeps watching
                  incremental → POST /api/oscar { mode: 'incremental', ledger, diff, hint }
                  full        → POST /api/oscar { mode: 'full' }
resumed typing → abort fetch, mark in-flight revision stale; ledger keeps last settled state
```

Cost picture: scout calls track thought boundaries (a typical sentence triggers 2–4 consults, not one per keystroke) + at most one mini analysis per pause, often skipped or scoped down by the verdict — strictly cheaper and far calmer than naive full re-analysis on every pause.

## Failure semantics

- **Scout down/slow:** raced with a 250ms timeout; local rules decide. Scout is an optimization, never a dependency.
- **Analysis step fails:** workflow retries the step; the ledger keeps its last settled state (the drawer never blanks — worst case it shows slightly stale, clearly-marked judgements).
- **Evidence quote not found** (model paraphrased): item gets `anchor: null` — it renders normally but can't be optimistically invalidated; the next incremental pass reconciles it.
- **Ops referencing unknown ids / stale revision:** dropped by the reducer, logged in dev.

## Build order (replaces steps 2–3 in tech-spec)

1. Ledger + reducer + diff classifier as pure functions — **unit-testable without any UI or API**. This is the highest-risk logic; build it first.
2. `oscarWorkflow` full mode end-to-end: ops stream → reducer → panels fill.
3. Incremental mode: prompt template, diff rendering, append/delete demos working.
4. Scout route + harness decision rules; wire the `reason` status line.
5. Agent tasks in the schema + dispatch-queue UI + ledger-coupled cancellation.
6. Fixtures + dev toggle for the scripted demo.
