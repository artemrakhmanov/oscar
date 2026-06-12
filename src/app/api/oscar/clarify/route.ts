import { generateObject } from "ai";
import { buildClarifyPrompt, CLARIFY_SYSTEM } from "@/lib/oscar/prompts";
import { clarifyQuestionsSchema } from "@/lib/oscar/schema";
import { ANALYSIS_MODEL } from "@/lib/oscar/models";
import type { ClarifyRequest } from "@/lib/oscar/clarify";

/**
 * The "fix" endpoint: turns the current attention points into clarifying
 * questions with concrete answer options. One-shot, no streaming — the
 * panel renders all questions at once.
 */
export async function POST(req: Request) {
  const input = (await req.json()) as ClarifyRequest;

  if (!input.prompt?.trim() || !Array.isArray(input.items) || input.items.length === 0) {
    return Response.json({ error: "prompt and items required" }, { status: 400 });
  }

  const { object } = await generateObject({
    model: ANALYSIS_MODEL,
    schema: clarifyQuestionsSchema,
    system: CLARIFY_SYSTEM,
    prompt: buildClarifyPrompt(input),
    abortSignal: req.signal,
    providerOptions: {
      openai: { reasoningEffort: "minimal", textVerbosity: "low" },
    },
  });

  // Drop questions pointing at items the client didn't send (model drift).
  const known = new Set(input.items.map((i) => i.id));
  const questions = object.questions.filter((q) => known.has(q.itemId));

  return Response.json({ questions });
}
