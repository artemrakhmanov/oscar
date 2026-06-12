import { generateObject } from "ai";
import { buildScoutPrompt, SCOUT_SYSTEM } from "@/lib/oscar/prompts";
import { scoutVerdictSchema } from "@/lib/oscar/schema";
import { SCOUT_MODEL } from "@/lib/oscar/models";
import type { ScoutRequest } from "@/lib/oscar/types";

/**
 * The scout — disposable triage, deliberately NOT a workflow (an obsolete
 * scout opinion is worthless; durability would be waste). The client races
 * this against a timeout and falls back to local rules.
 */
export async function POST(req: Request) {
  const input = (await req.json()) as ScoutRequest;

  const { object } = await generateObject({
    model: SCOUT_MODEL,
    schema: scoutVerdictSchema,
    system: SCOUT_SYSTEM,
    prompt: buildScoutPrompt(input),
    abortSignal: req.signal,
    providerOptions: {
      openai: { reasoningEffort: "minimal", textVerbosity: "low" },
    },
  });

  return Response.json(object);
}
