import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OscarHarness, PAUSE_MS } from "../harness";
import type { ScoutVerdict } from "../types";

/**
 * Orchestration tests: fake fetch + fake timers drive the whole pipeline —
 * gate → scout race → decision → streamed ops → reducer → commit/abort.
 */

const encoder = new TextEncoder();

interface FakeRoute {
  scout?: Partial<ScoutVerdict> | "hang";
  /** Chunks of the analysis text stream. */
  analysis?: string[] | "hang";
}

function makeFetch(route: FakeRoute, calls: { url: string; body: any }[]) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, body: JSON.parse(String(init?.body ?? "{}")) });

    if (url.includes("/scout")) {
      if (route.scout === "hang") return new Promise<Response>(() => {});
      const verdict: ScoutVerdict = {
        action: "incremental",
        reason: "test verdict",
        affectedDimensions: [],
        midThought: false,
        contradicts: [],
        ...route.scout,
      };
      return {
        ok: true,
        json: async () => verdict,
      } as unknown as Response;
    }

    // Analysis: stream the configured chunks, erroring on abort.
    const signal = init?.signal as AbortSignal | undefined;
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        controller = c;
        const chunks = route.analysis === "hang" ? [] : (route.analysis ?? []);
        for (const chunk of chunks) c.enqueue(encoder.encode(chunk));
        if (route.analysis !== "hang") c.close();
      },
    });
    signal?.addEventListener("abort", () => {
      try {
        controller.error(new DOMException("aborted", "AbortError"));
      } catch {
        /* already closed */
      }
    });
    return { ok: true, body: stream } as unknown as Response;
  }) as unknown as typeof fetch;
}

const FULL_PAYLOAD = JSON.stringify({
  operations: [
    {
      op: "add",
      dimension: "objectives",
      item: {
        id: "obj-1",
        content: { text: "Refactor auth onto the session store" },
        evidence: "Refactor the auth module to use the new session store",
      },
    },
    {
      op: "add",
      dimension: "ambiguities",
      item: {
        id: "amb-1",
        content: { question: "Which session store?", interpretations: ["redis", "pg"] },
        evidence: "use the new session store",
      },
    },
  ],
  agentTasks: [
    {
      id: "task-1",
      triggeredBy: "amb-1",
      agentRole: "codebase-scout",
      prompt: "Search this repository for session-store implementations.",
      expectedOutput: "module paths and interfaces",
    },
  ],
});

const PROMPT = "Refactor the auth module to use the new session store.";

async function settleFullAnalysis(harness: OscarHarness) {
  harness.onTextChange(PROMPT);
  await vi.advanceTimersByTimeAsync(PAUSE_MS + 300);
  await vi.advanceTimersByTimeAsync(50);
}

describe("OscarHarness", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs a full analysis after the pause and fills the ledger", async () => {
    const calls: { url: string; body: any }[] = [];
    const harness = new OscarHarness({
      fetcher: makeFetch({ analysis: [FULL_PAYLOAD] }, calls),
    });

    await settleFullAnalysis(harness);

    const snap = harness.getSnapshot();
    expect(snap.ledger.items).toHaveLength(2);
    expect(snap.ledger.analyzedText).toBe(PROMPT);
    expect(snap.tasks).toHaveLength(1);
    expect(snap.phase).toBe("idle");

    const analysisCall = calls.find((c) => c.url === "/api/oscar");
    expect(analysisCall?.body.mode).toBe("full");
    // The sentence boundary consulted the scout before the pause.
    expect(calls.some((c) => c.url.includes("/scout"))).toBe(true);
  });

  it("holds back the trailing half-streamed op until it completes", async () => {
    const splitAt = FULL_PAYLOAD.indexOf('"amb-1"');
    const calls: { url: string; body: any }[] = [];
    const harness = new OscarHarness({
      fetcher: makeFetch(
        { analysis: [FULL_PAYLOAD.slice(0, splitAt), FULL_PAYLOAD.slice(splitAt)] },
        calls,
      ),
    });
    await settleFullAnalysis(harness);
    // Both ops applied exactly once, none half-rendered.
    expect(harness.getSnapshot().ledger.items.map((i) => i.id)).toEqual([
      "obj-1",
      "amb-1",
    ]);
  });

  it("obeys a scout 'wait' verdict when the ledger is settled", async () => {
    const calls: { url: string; body: any }[] = [];
    const harness = new OscarHarness({
      fetcher: makeFetch({ analysis: [FULL_PAYLOAD], scout: { action: "wait", reason: "mid-thought" } }, calls),
    });
    await settleFullAnalysis(harness);
    const analysisCallsBefore = calls.filter((c) => c.url === "/api/oscar").length;

    // Append ending in a connective — gate consults, scout says wait.
    harness.onTextChange(PROMPT + " and ");
    await vi.advanceTimersByTimeAsync(PAUSE_MS + 300);

    expect(calls.filter((c) => c.url === "/api/oscar").length).toBe(analysisCallsBefore);
    expect(harness.getSnapshot().scoutReason).toBe("mid-thought");
  });

  it("falls back to local rules when the scout hangs", async () => {
    const calls: { url: string; body: any }[] = [];
    const harness = new OscarHarness({
      fetcher: makeFetch({ analysis: [FULL_PAYLOAD], scout: "hang" }, calls),
    });
    await settleFullAnalysis(harness);

    const incremental = JSON.stringify({
      operations: [
        {
          op: "add",
          dimension: "constraints",
          item: {
            id: "con-1",
            content: { text: "Keep API identical", severity: "hard" },
            evidence: "Keep the API identical",
          },
        },
      ],
      agentTasks: [],
    });
    (harness as any).fetcher = makeFetch({ analysis: [incremental], scout: "hang" }, calls);

    // Small append relative to the text — stays under the rewrite threshold.
    harness.onTextChange(PROMPT + " Keep the API identical.");
    await vi.advanceTimersByTimeAsync(PAUSE_MS + 300);
    await vi.advanceTimersByTimeAsync(100);

    const call = calls.filter((c) => c.url === "/api/oscar").at(-1);
    expect(call?.body.mode).toBe("incremental");
    expect(harness.getSnapshot().ledger.items.map((i) => i.id)).toContain("con-1");
  });

  it("aborts the in-flight run when typing resumes, keeping applied ops and stale marks", async () => {
    const calls: { url: string; body: any }[] = [];
    const harness = new OscarHarness({
      fetcher: makeFetch({ analysis: [FULL_PAYLOAD] }, calls),
    });
    await settleFullAnalysis(harness);

    // Incremental run that hangs mid-stream.
    const partial = JSON.stringify({
      operations: [{ op: "confirm", id: "obj-1" }],
    }).slice(0, -2); // stream stays open after the first complete op...
    (harness as any).fetcher = makeFetch({ analysis: "hang", scout: { action: "incremental" } }, calls);

    const appended = PROMPT + " Keep the API identical.";
    harness.onTextChange(appended);
    await vi.advanceTimersByTimeAsync(PAUSE_MS + 300);
    expect(harness.getSnapshot().phase).toBe("analyzing");

    // User resumes typing → abort. Ledger keeps its last settled judgements.
    harness.onTextChange(appended + " More");
    await vi.advanceTimersByTimeAsync(10);

    const snap = harness.getSnapshot();
    expect(snap.ledger.items).toHaveLength(2);
    // The aborted run committed its snapshot as analyzedText.
    expect(snap.ledger.analyzedText).toBe(appended);
  });

  it("optimistically invalidates items whose anchors are deleted, before any API call", async () => {
    const calls: { url: string; body: any }[] = [];
    const harness = new OscarHarness({
      fetcher: makeFetch({ analysis: [FULL_PAYLOAD] }, calls),
    });
    await settleFullAnalysis(harness);
    const apiCalls = calls.length;

    // Delete "the new " — amb-1's anchor overlaps the removed span.
    const cut = PROMPT.replace("the new ", "");
    harness.onTextChange(cut);

    // Same frame, zero new fetches.
    expect(calls.length).toBe(apiCalls);
    const amb = harness.getSnapshot().ledger.items.find((i) => i.id === "amb-1");
    expect(amb?.status).toBe("invalidated");
  });

  it("clearing the composer resets the ledger", async () => {
    const harness = new OscarHarness({
      fetcher: makeFetch({ analysis: [FULL_PAYLOAD] }, []),
    });
    await settleFullAnalysis(harness);
    harness.onTextChange("");
    expect(harness.getSnapshot().ledger.items).toHaveLength(0);
  });
});
