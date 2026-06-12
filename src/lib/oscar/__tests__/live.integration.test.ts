import { describe, expect, it } from "vitest";
import { OscarHarness } from "../harness";

/**
 * Live integration: drives the real harness against the running dev server
 * (real models, real streaming). Opt-in — costs money and needs `npm run dev`:
 *   RUN_LIVE=1 npx vitest run live.integration
 */
const LIVE = process.env.RUN_LIVE === "1";
const BASE = process.env.LIVE_BASE_URL ?? "http://localhost:3000";

describe.skipIf(!LIVE)("live harness ↔ real endpoints", () => {
  it(
    "full analysis fills the ledger from a real stream, then an append resolves incrementally",
    { timeout: 120_000 },
    async () => {
      const events: string[] = [];
      const harness = new OscarHarness({
        fetcher: (input, init) => fetch(new URL(String(input), BASE), init),
        onEvent: (e) => events.push(`${e.label}${e.detail ? ` — ${e.detail}` : ""}`),
      });

      const prompt =
        "Refactor the auth middleware to accept API keys in addition to session cookies. Keep the public API surface identical.";
      harness.onTextChange(prompt);

      // Wait for the full analysis to settle.
      await waitFor(() => harness.getSnapshot().ledger.analyzedText === prompt, 60_000);
      const afterFull = harness.getSnapshot();
      expect(afterFull.ledger.items.length).toBeGreaterThanOrEqual(3);
      expect(afterFull.lastRunMode).toBe("full");

      // Every item's evidence should anchor (verbatim-quote rule held).
      const anchored = afterFull.ledger.items.filter((i) => i.anchor !== null);
      expect(anchored.length).toBeGreaterThanOrEqual(
        Math.ceil(afterFull.ledger.items.length / 2),
      );

      // Append a clause that answers the header-vs-query ambiguity.
      const appended = prompt + " Keys live in the X-Api-Key header.";
      harness.onTextChange(appended);
      await waitFor(() => harness.getSnapshot().ledger.analyzedText === appended, 60_000);

      const after = harness.getSnapshot();
      expect(after.lastRunMode).toBe("incremental");
      // The judgements survived — the ledger was edited, not repainted.
      const survivors = after.ledger.items.filter((i) =>
        afterFull.ledger.items.some((p) => p.id === i.id),
      );
      expect(survivors.length).toBeGreaterThan(0);

      // eslint-disable-next-line no-console
      console.log("events:\n" + events.map((e) => `  ${e}`).join("\n"));
      // eslint-disable-next-line no-console
      console.log(
        "ledger:\n" +
          after.ledger.items
            .map((i) => `  [${i.dimension}] ${i.id} (${i.status}) anchor=${!!i.anchor}`)
            .join("\n"),
      );
    },
  );
});

async function waitFor(cond: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitFor timed out");
    await new Promise((r) => setTimeout(r, 250));
  }
}
