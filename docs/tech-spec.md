# OSCAR — Tech Spec

Companion to [idea.md](./idea.md). This covers the hackathon build: a standalone Next.js web app that mocks an agentic composer and runs the live OSCAR drawer on top of it.

## Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js 16.2.9, App Router | Already scaffolded. Turbopack is the default in v16. |
| UI | React 19, Tailwind v4, shadcn/ui, lucide-react | Already installed. |
| LLM layer | **Vercel AI SDK** (`ai`, `@ai-sdk/react`, provider package, `zod`) | To install. Core primitive: `streamObject` for typed, partially-streamed JSON. |
| Model | OpenAI `gpt-5-mini` via `@ai-sdk/openai` | Analysis must be fast and cheap; one call per typing pause. `gpt-5-nano` if we want cheaper still; swappable in one place. |
| Orchestration | **Vercel Workflow DevKit** (`workflow` package) | The analysis harness runs as a durable workflow; the route handler just starts a run and pipes its stream back. See decision below. |
| Hosting | Vercel (or local dev for the demo) | No infra beyond env vars. |

## Architecture overview

```
┌─────────────────────────────────────────────┐
│  OSCAR Drawer (expands above composer)      │
│ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐    │
│ │  O  │ │  S  │ │  C  │ │  A  │ │  R  │    │  ← 5 panels fed from
│ └─────┘ └─────┘ └─────┘ └─────┘ └─────┘    │     one partial object
└──────────────────▲──────────────────────────┘
                   │  POST /api/oscar (+ /api/oscar/scout)
                   │  └→ start(oscarWorkflow) → run.readable
                   │     (streamed ledger operations via getWritable)
┌──────────────────┴──────────────────────────┐
│  Composer (mock chat input)                  │
│  debounce 700ms → hash check → analyze      │
└─────────────────────────────────────────────┘
```

### One call, five categories — the decision

**A single `streamObject` call covers all five dimensions** (`objectives`, `scope`, `constraints`, `ambiguities`, `risks`); the drawer fans the streamed result out visually into five panels.

- One analysis call per pause = 1× cost/latency, one request to debounce and abort, no cross-request state to coordinate. Drastically simpler hook and API surface.
- Partial-object streaming still gives the "agents working" feel: operations arrive incrementally (ordered O→S→C→A→R in full mode), so panels light up one after another as the model emits each section.
- The "five background agents" in the brief is a *presentation* concept — each panel gets its own status indicator driven by whether its dimension's items have started/finished arriving.
- Trade-off accepted: one prompt juggles five sections (mitigated by a tight system prompt with per-section rules), and one failure stalls the whole drawer (softened by workflow step retries and the ledger keeping its last settled state).

### Vercel Workflows — the analysis harness is a durable run

The analysis is a background task from the app's point of view, so it runs as a **Workflow DevKit** workflow rather than inline in the route handler. The handler stays thin: start a run, return its stream.

```ts
// app/api/oscar/route.ts
import { start } from 'workflow/api'
export async function POST(req: Request) {
  const input = await req.json()   // { prompt, context, mode, ledger?, diff?, hint? }
  const run = await start(oscarWorkflow, [input])
  return new Response(run.readable, { headers: { 'Content-Type': 'text/plain' } })
}

// workflows/oscar.ts
export async function oscarWorkflow(input: OscarInput) {
  'use workflow'
  await analyzeStep(input)   // 'use step' — calls streamObject, pipes
}                            // partial ops JSON into getWritable()
```

The scout endpoint (`POST /api/oscar/scout`) is deliberately *not* a workflow — scout verdicts are disposable, so durability would be waste. See [oscar-method.md](./oscar-method.md).

What durability buys us:

- **Step retries** — a flaked LLM call re-runs automatically instead of blanking the drawer (this also softens the single-call trade-off above: the one failure mode now self-heals).
- **Resumable streams** — if the client connection drops, it can reconnect to the same run instead of re-paying for the analysis. Note this isn't free: the client only holds a fetch, so the POST must expose the run id (e.g. an `X-Oscar-Run-Id` response header) and a small `GET /api/oscar/runs/[runId]?startIndex=n` handler must call `getRun()` + `run.getReadable({ startIndex })`. Build it only if time allows — until then resumability is a *capability*, not a feature.
- **Observability** — every analysis run is inspectable (`npx workflow web`), which during a hackathon doubles as the debugging story.

Constraints to respect: streams can only be touched inside `'use step'` functions (never in the workflow body), and the writer must `releaseLock()` or the HTTP response hangs. Setup: `npm i workflow`, wrap `next.config.ts` with `withWorkflow()` from `workflow/next`.

**Stale runs:** when the user resumes typing, the client aborts its fetch, but the workflow run completes server-side and is discarded. That's fine — `gpt-5-mini` runs are cheap, and the debounce + hash check already keep run volume low. Don't build cancellation plumbing for v1.

## The analysis method — see [oscar-method.md](./oscar-method.md)

The full design of the harness lives in its own spec: the **ledger** (persistent judgement items with evidence anchors), **edit classification** (append adds by default but can contradict/supersede, delete invalidates, rewrite resets), the always-on **scout agent** that guides when and how to analyze, the **operations-based streaming contract** (`add`/`revise`/`confirm`/`remove` against the ledger instead of full-snapshot replaces), prompt templates for full and incremental modes, and the **mocked research-agent dispatch queue**. Headlines that shape the rest of this doc:

- Endpoint is `POST /api/oscar` (durable workflow run, streamed ledger operations) plus `POST /api/oscar/scout` (plain handler, `gpt-5-nano` triage, fired only by a deterministic trigger gate — sentence/clause punctuation, connective keywords, word bursts — never per keystroke).
- The drawer renders from the client-held ledger via a reducer — never from a raw response — so re-analysis edits the drawer instead of repainting it.
- The dimension item shapes (`objectives: { text }`, `scope: { text, kind }`, `constraints: { text, severity }`, `ambiguities: { question, interpretations }`, `risks: { text, likelihood }`) live in the shared zod schema as each item's `content` payload.
- The Scope/Constraints split is enforced in the prompt core: **Scope = blast radius**, **Constraints = rules the work must obey**.

## Client structure

```
src/
  app/
    page.tsx                  — the mock agent interface
    api/oscar/route.ts        — starts oscarWorkflow, returns run.readable
    api/oscar/scout/route.ts  — plain handler, nano triage (no workflow)
  components/
    composer.tsx              — chat input mock (textarea, send button, fake toolbar)
    drawer.tsx                — expanding panel container above composer
    dimension-panel.tsx       — one OSCAR letter: header, status dot, ledger items
    dispatch-queue.tsx        — mocked research-agent task cards under the drawer
    transcript.tsx            — fake message history above (sells the "real tool" illusion)
  workflows/
    oscar.ts                  — 'use workflow' + analyzeStep ('use step')
  lib/oscar/
    schema.ts, prompts.ts     — ops/tasks zod schema; full/incremental/scout templates
    ledger.ts, diff.ts        — ledger reducer, edit classifier, anchor maintenance (pure, unit-tested)
    dimensions.ts             — registry: letter, label, color, item renderer
    fixtures.ts               — canned ledgers + agent tasks for the scripted demo
  hooks/
    use-oscar.ts              — the harness: debounce, scout race, decision rules, abort; wraps one useObject
```

- A single `useObject` (from `@ai-sdk/react`) streams the partial `{ operations, agentTasks }` object with `stop()` and loading state out of the box; the harness feeds new operations through the ledger reducer, and each panel renders its dimension's items from the ledger.
- The drawer renders all five panels in a grid (or horizontal strip); panel content animates in per item.
- Mock interface intentionally apes a Claude Code-style composer so the demo reads as "this lives inside your tool".

## Dependencies to add

```
npm i ai @ai-sdk/react @ai-sdk/openai zod workflow
```

Env: `OPENAI_API_KEY` in `.env.local`. Config: wrap `next.config.ts` with `withWorkflow()` from `workflow/next`.

## Next 16 gotchas (this repo ≠ training data)

Per `node_modules/next/dist/docs/` — read the relevant guide before coding. Highlights that affect us:

- `params` / `searchParams` / `headers()` / `cookies()` are **async** — always `await`.
- GET route handlers are dynamic (uncached) by default — fine for us.
- Turbopack is the default dev/build — no `--turbopack` flag needed.
- Middleware is renamed `proxy.ts` (we don't need one).
- Streaming via `ReadableStream` / AI SDK responses is unchanged.

## Out of scope (v1)

- No prompt rewriting or suggested edits — the drawer is read-only.
- No actual agent execution — "send" can just append to the fake transcript.
- No real codebase context (a hardcoded `context` blurb may be passed to make demos richer).
- No IDE/Claude Code integration, no persistence, no auth, no multi-turn analysis.
- No workflow-run cancellation plumbing — stale runs finish and get discarded.

## Build order

0. Spikes: `run.readable` ↔ `useObject` framing compatibility; `start()` time-to-first-chunk (see [oscar-method.md](./oscar-method.md) § Implementation risks).
1. Static shell: composer + transcript + empty drawer with five panels (pure UI, no API).
2. Ledger + reducer + diff classifier as pure functions — unit-tested before any API exists.
3. `oscarWorkflow` full mode end-to-end: ops stream → reducer → panels fill.
4. Incremental mode (append/delete demos working), then scout + harness decision rules.
5. Dispatch queue (agent tasks) + ledger-coupled cancellation.
6. Status choreography, fixtures + dev toggle, dark theme, polish.

(Steps 2–5 are detailed in [oscar-method.md](./oscar-method.md).)
