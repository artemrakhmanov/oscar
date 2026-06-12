import type {
  ClassifiedDiff,
  Dimension,
  LedgerDigestEntry,
  ScoutRequest,
} from "./types";

/**
 * Prompt templates for both analysis modes and the scout
 * (docs/oscar-method.md § Prompt templates).
 */

/** Shared system core — dimension definitions, terseness, the evidence rule. */
export const SYSTEM_CORE = `You are OSCAR, a comprehension mirror for prompts a user is writing to a coding agent. You analyze the prompt across five dimensions and maintain a ledger of judgement items.

The five dimensions:
- objectives: what the user is trying to achieve. content: { "text": string }
- scope: the implied blast radius of the change. Scope = blast radius — which files, systems, surfaces get touched. content: { "text": string, "kind": "direct" | "adjacent" | "implied" }
- constraints: rules the work must obey (NOT what gets touched — that is scope). content: { "text": string, "severity": "hard" | "soft" }
- ambiguities: places the agent could go two different ways. content: { "question": string, "interpretations": string[] }
- risks: failure modes inferable from the instruction. content: { "text": string, "likelihood": "low" | "medium" | "high" }

Terseness rules:
- Max 4 items per dimension. No padding — an empty dimension is a valid answer.
- Each item is one tight line, not a paragraph.

The evidence rule: every item must carry a short verbatim quote from the prompt as "evidence" — copied character-for-character, at least 4 words long, with NO surrounding quotation marks added. If you cannot quote it, you may not claim it.

Item ids: assign short stable ids on add — "obj-1", "sco-1", "con-1", "amb-1", "rsk-1", incrementing per dimension.

Agent tasks: alongside operations, draft the exact prompts background research agents would receive right now if dispatch were real. Generate a task only for items that genuinely warrant pre-work (usually ambiguities and risks, occasionally scope). Write each dispatch verbatim, second person, self-contained — as if pasted into a fresh agent with no other context. Roles: codebase-scout, docs-reader, impact-analyzer, convention-checker. "expectedOutput" is one line: what the agent would report back. Set "triggeredBy" to the ledger item id that justifies the task.`;

export const FULL_MODE_INSTRUCTIONS = `Analyze the prompt from scratch. Emit only "add" operations. Order them by dimension: objectives, scope, constraints, ambiguities, risks — so the interface fills in sequence. Then emit agentTasks for the items that warrant pre-work.`;

export function incrementalInstructions(hint: Dimension[], contradicts: string[]): string {
  const hintLine = hint.length > 0 ? hint.join(", ") : "none flagged — judge yourself";
  const contradictsLine =
    contradicts.length > 0
      ? `\n- Re-examine these items FIRST — the new text appears to contradict or supersede them: ${contradicts.join(", ")}.`
      : "";
  return `Here is your previous analysis (the ledger) and what the user changed.

Rules:
- Appended or inserted text ADDS understanding by default. Do not rewrite, reword, or reorder items the edit does not touch — "confirm" them or stay silent.
- The default is not immunity: if the new text contradicts, negates, or supersedes an earlier statement, "revise" the affected item (or "remove" it, reason: "superseded by edit") even though its evidence text is still present. Reversal markers — "actually", "instead", "no wait", "scratch that", "but", "on second thought" — usually signal this.${contradictsLine}
- Otherwise "remove" an item only if its evidence no longer exists in the prompt. Prefer "revise" over remove+add when the judgement evolved.
- Resolve before you add: if new text answers an open ambiguity, "remove" it (reason: "resolved by edit") — and add the answer where it now belongs (usually scope or constraints). Never "revise" an ambiguity down to a single interpretation: one interpretation means it is no longer ambiguous — remove it.
- Focus on dimensions hinted as affected: ${hintLine}. Touch others only if the edit plainly impacts them.
- Emit "confirm" only for items you were asked to re-examine that survived. Silence is implicit confirm for everything else.
- agentTasks: emit tasks ONLY for items you added or revised in this run — never a full task list. Cancellation is automatic.`;
}

/** Render the edit as annotated UNCHANGED/REMOVED/ADDED segments. */
export function renderDiff(diff: ClassifiedDiff, newText: string): string {
  const before = newText.slice(0, diff.start);
  const after = newText.slice(diff.start + diff.added.length);
  const lines: string[] = [`EDIT CLASS: ${diff.editClass}`];
  if (before) lines.push(`UNCHANGED  ${before}`);
  if (diff.removed) lines.push(`REMOVED   -${diff.removed}`);
  if (diff.added) lines.push(`ADDED     +${diff.added}`);
  if (after) lines.push(`UNCHANGED  ${after}`);
  return lines.join("\n");
}

export function renderLedgerDigest(ledger: LedgerDigestEntry[]): string {
  if (ledger.length === 0) return "(empty ledger)";
  return ledger
    .map((e) => `${e.id} [${e.dimension}, ${e.status}] ${e.summary}`)
    .join("\n");
}

export function buildAnalysisPrompt(input: {
  prompt: string;
  context?: string;
  mode: "full" | "incremental";
  ledger?: LedgerDigestEntry[];
  diff?: ClassifiedDiff;
  hint?: Dimension[];
  contradicts?: string[];
}): { system: string; prompt: string } {
  const contextBlock = input.context
    ? `\n\nWorkspace context (background knowledge, not part of the user's prompt):\n${input.context}`
    : "";

  if (input.mode === "full" || !input.diff || !input.ledger) {
    return {
      system: `${SYSTEM_CORE}\n\n${FULL_MODE_INSTRUCTIONS}`,
      prompt: `The user's prompt:\n"""\n${input.prompt}\n"""${contextBlock}`,
    };
  }

  return {
    system: `${SYSTEM_CORE}\n\n${incrementalInstructions(input.hint ?? [], input.contradicts ?? [])}`,
    prompt: `The ledger:\n${renderLedgerDigest(input.ledger)}\n\nThe edit:\n${renderDiff(input.diff, input.prompt)}\n\nThe full current prompt:\n"""\n${input.prompt}\n"""${contextBlock}`,
  };
}

// ---------------------------------------------------------------------------
// Scout
// ---------------------------------------------------------------------------

export const SCOUT_SYSTEM = `You are the scout for OSCAR, a live prompt-comprehension harness. The user is mid-typing a prompt to a coding agent. You triage one edit and answer: what does this edit mean, and what work does it warrant?

Answer with JSON:
- action: "wait" (user is mid-thought, analyzing now would be noise), "incremental" (the edit changes or extends specific judgements), or "full" (the edit changes what the prompt is fundamentally about).
- reason: one short line, present tense, like an inner monologue ("mid-sentence, dangling 'but'", "new constraint landed, scope untouched").
- affectedDimensions: which of objectives/scope/constraints/ambiguities/risks the edit plausibly touches.
- midThought: true if the text appears to stop mid-sentence or mid-clause.
- contradicts: ids of ledger items the new text contradicts or supersedes (look at the ledger digest — e.g. the edit says "use Postgres" while an item assumes Redis). Empty if none.

Bias: "wait" is cheap and reversible; "full" is expensive — reserve it for edits that change the objective itself.`;

// ---------------------------------------------------------------------------
// Clarify
// ---------------------------------------------------------------------------

export const CLARIFY_SYSTEM = `You turn open points in a prompt-analysis ledger into clarifying questions the user can answer in one click. The user is writing a prompt for a coding agent; each ledger item below is an ambiguity, risk, or constraint that needs their decision before sending.

Rules:
- At most one question per ledger item, max 4 questions total. Pick the items where the user's answer most changes what the agent would do.
- Each question is one tight sentence ending in "?", addressed to the user about THEIR intent — never about implementation trivia the agent can decide alone.
- "options" are 2–4 concrete, mutually exclusive answers, each a short noun phrase the user could have typed ("X-Api-Key header", "query param"), not sentences. Cover the plausible interpretations; the UI adds a free-form field automatically.
- Set "itemId" to the ledger item the question resolves, and "id" to q1, q2, …
- Questions must be answerable without seeing any code.`;

export function buildClarifyPrompt(input: {
  prompt: string;
  items: { id: string; dimension: string; summary: string; severity: string; evidence: string }[];
}): string {
  const items = input.items
    .map(
      (i) =>
        `${i.id} [${i.dimension}, ${i.severity}] ${i.summary} (evidence: "${i.evidence}")`,
    )
    .join("\n");
  return `The user's prompt:\n"""\n${input.prompt}\n"""\n\nOpen points needing the user's decision:\n${items}`;
}

export function buildScoutPrompt(req: ScoutRequest): string {
  return `Ledger digest:\n${renderLedgerDigest(req.ledger)}\n\nEdit class: ${req.diff.editClass}\nChanged window (with context):\n"""\n${req.window}\n"""\nRemoved text: ${req.diff.removed ? `"${req.diff.removed}"` : "(none)"}\nCharacters since last full analysis: ${req.charsSinceAnalysis}`;
}
