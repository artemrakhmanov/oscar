import { streamObject } from "ai";
import { buildAnalysisPrompt } from "@/lib/oscar/prompts";
import { analysisSchema } from "@/lib/oscar/schema";
import { ANALYSIS_MODEL } from "@/lib/oscar/models";
import type { OscarAnalyzeRequest } from "@/lib/oscar/types";

/**
 * The main analysis endpoint — one endpoint, two modes (full/incremental),
 * streaming ledger operations as partial JSON text. Plain handler for now;
 * the durable-workflow envelope (tech-spec § Vercel Workflows) is a later
 * refactor — the client consumes a byte stream either way.
 */
export async function POST(req: Request) {
  const input = (await req.json()) as OscarAnalyzeRequest;

  if (typeof input.prompt !== "string" || !input.prompt.trim()) {
    return Response.json({ error: "prompt required" }, { status: 400 });
  }

  const { system, prompt } = buildAnalysisPrompt(input);

  const result = streamObject({
    model: ANALYSIS_MODEL,
    schema: analysisSchema,
    system,
    prompt,
    abortSignal: req.signal,
    // Live-typing harness: latency is the product. Reasoning effort stays
    // minimal — the analysis must feel instant, not exhaustive.
    providerOptions: {
      openai: { reasoningEffort: "minimal", textVerbosity: "low" },
    },
  });

  return result.toTextStreamResponse();
}
