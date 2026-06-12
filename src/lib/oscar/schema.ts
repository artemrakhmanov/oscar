import { z } from "zod";

/**
 * Zod schemas for everything that crosses the model boundary.
 * The reducer validates each streamed operation against `operationSchema`
 * before applying it — a partially-streamed op never reaches the ledger.
 */

export const dimensionSchema = z.enum([
  "objectives",
  "scope",
  "constraints",
  "ambiguities",
  "risks",
]);

export const contentSchema = z.union([
  z.object({ question: z.string().min(1), interpretations: z.array(z.string()) }),
  z.object({ text: z.string().min(1), kind: z.enum(["direct", "adjacent", "implied"]) }),
  z.object({ text: z.string().min(1), severity: z.enum(["hard", "soft"]) }),
  z.object({ text: z.string().min(1), likelihood: z.enum(["low", "medium", "high"]) }),
  z.object({ text: z.string().min(1) }),
]);

// NB: z.union, not discriminatedUnion — the latter compiles to JSON-Schema
// `oneOf`, which OpenAI structured outputs rejects (`anyOf` is accepted).
export const operationSchema = z.union([
  z.object({
    op: z.literal("add"),
    dimension: dimensionSchema,
    item: z.object({
      id: z.string().min(1),
      content: contentSchema,
      evidence: z.string().min(1),
    }),
  }),
  z.object({
    op: z.literal("revise"),
    id: z.string().min(1),
    content: contentSchema,
    evidence: z.string().min(1),
  }),
  z.object({ op: z.literal("confirm"), id: z.string().min(1) }),
  z.object({ op: z.literal("remove"), id: z.string().min(1), reason: z.string() }),
]);

export const agentTaskSchema = z.object({
  id: z.string().min(1),
  triggeredBy: z.string().min(1),
  agentRole: z.enum([
    "codebase-scout",
    "docs-reader",
    "impact-analyzer",
    "convention-checker",
  ]),
  prompt: z.string().min(1),
  expectedOutput: z.string().min(1),
});

/** Full streamed payload of POST /api/oscar. */
export const analysisSchema = z.object({
  operations: z.array(operationSchema),
  agentTasks: z.array(agentTaskSchema),
});

export const scoutVerdictSchema = z.object({
  action: z.enum(["wait", "incremental", "full"]),
  reason: z.string(),
  affectedDimensions: z.array(dimensionSchema),
  midThought: z.boolean(),
  contradicts: z.array(z.string()),
});

export type AnalysisPayload = z.infer<typeof analysisSchema>;
