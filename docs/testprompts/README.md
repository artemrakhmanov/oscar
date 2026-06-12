# OSCAR test prompts

Manual exploration scripts for the composer. Each file is one scenario: text to type or paste, the edit sequence to perform, and what the drawer/scout/dispatch queue *should* do at each step (per [../oscar-method.md](../oscar-method.md)).

| File | Exercises |
|---|---|
| [01-full-analysis.md](./01-full-analysis.md) | Full-mode analysis on first pause; O→S→C→A→R fill order; item caps |
| [02-append-extends.md](./02-append-extends.md) | Append that adds understanding — existing items must not move |
| [03-append-contradicts.md](./03-append-contradicts.md) | Append that supersedes earlier statements; scout `contradicts` |
| [04-delete-invalidation.md](./04-delete-invalidation.md) | Optimistic invalidation on delete; anchor-overlap semantics |
| [05-ambiguity-resolution.md](./05-ambiguity-resolution.md) | The money shot: typed clause dissolves an ambiguity, adds scope |
| [06-replace-and-rewrite.md](./06-replace-and-rewrite.md) | Replace-clause semantics; >40% rewrite → ledger reset |
| [07-scout-gate.md](./07-scout-gate.md) | Trigger gate: boundaries, reversal markers, mid-word silence |
| [08-agent-tasks.md](./08-agent-tasks.md) | Dispatch queue: task generation, replacement, cancellation |
| [09-edge-cases.md](./09-edge-cases.md) | Short text, duplicate quotes, paste, abort-mid-stream, vague prompts |

General checks that apply to every scenario:

- The drawer never repaints wholesale — items appear/grey/firm up individually.
- Nothing fires while you're mid-word; the scout `reason` line updates at thought boundaries.
- Every item's evidence quote highlights a real span in your text (≥ 4 words).
- Statuses are honest: anything not yet re-examined after an edit shows `stale`, never silently "current".
