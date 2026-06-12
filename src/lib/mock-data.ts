export interface TranscriptMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export const INITIAL_TRANSCRIPT: TranscriptMessage[] = [];

export const MODEL_OPTIONS = [
  { id: "gpt-5.1", label: "GPT-5.1" },
  { id: "gpt-5.1-codex", label: "GPT-5.1 Codex" },
  { id: "gpt-5.1-codex-mini", label: "GPT-5.1 Codex Mini" },
] as const;

export const MODE_OPTIONS = [
  { id: "ask", label: "Ask" },
  { id: "code", label: "Code" },
  { id: "plan", label: "Plan" },
] as const;

export const EFFORT_OPTIONS = [
  { id: "off", label: "Off" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
] as const;

export type OscarDimensionId =
  | "objectives"
  | "scope"
  | "constraints"
  | "ambiguities"
  | "risks";

export type OscarSeverity = "low" | "mid" | "high";

export interface OscarPoint {
  id: string;
  text: string;
  /** How urgently this point needs the user's eyes before sending. */
  severity: OscarSeverity;
}

export interface OscarDimension {
  id: OscarDimensionId;
  letter: string;
  label: string;
  /** One-line framing of what this dimension watches. */
  hint: string;
  points: OscarPoint[];
}

/** Static placeholder ledger for the top drawer (see docs/oscar-method.md). */
export const OSCAR_DIMENSIONS: OscarDimension[] = [
  {
    id: "objectives",
    letter: "O",
    label: "Objectives",
    hint: "what the agent thinks you're trying to achieve",
    points: [
      {
        id: "obj-1",
        text: "Refactor the auth middleware to accept API keys",
        severity: "low",
      },
      {
        id: "obj-2",
        text: "Keep the existing session-cookie flow working unchanged",
        severity: "low",
      },
    ],
  },
  {
    id: "scope",
    letter: "S",
    label: "Scope",
    hint: "the implied blast radius of the change",
    points: [
      {
        id: "sco-1",
        text: "src/middleware/auth.ts and its direct consumers",
        severity: "low",
      },
      { id: "sco-2", text: "Database schema and migrations", severity: "low" },
      {
        id: "sco-3",
        text: "Rate limiter shares the same middleware chain",
        severity: "mid",
      },
    ],
  },
  {
    id: "constraints",
    letter: "C",
    label: "Constraints",
    hint: "rules the work must obey",
    points: [
      {
        id: "con-1",
        text: "Public API surface must stay identical",
        severity: "mid",
      },
      { id: "con-2", text: "No new dependencies", severity: "low" },
    ],
  },
  {
    id: "ambiguities",
    letter: "A",
    label: "Ambiguities",
    hint: "places the agent could go two different ways",
    points: [
      {
        id: "amb-1",
        text: "Should API keys live in headers or query params?",
        severity: "mid",
      },
      {
        id: "amb-2",
        text: "“the auth module” — middleware only, or the token resolver too?",
        severity: "high",
      },
    ],
  },
  {
    id: "risks",
    letter: "R",
    label: "Risks",
    hint: "failure modes inferred from your instruction",
    points: [
      {
        id: "rsk-1",
        text: "Key auth could bypass the per-session rate limiter",
        severity: "high",
      },
      {
        id: "rsk-2",
        text: "Existing JWT tests may assert on cookie names",
        severity: "low",
      },
    ],
  },
];

export interface MockRepo {
  id: string;
  label: string;
  branches: string[];
  defaultBranch: string;
}

export const REPOS: MockRepo[] = [
  {
    id: "acme/oscar",
    label: "acme/oscar",
    branches: ["main", "feat/drawer-ui", "fix/debounce-race"],
    defaultBranch: "main",
  },
  {
    id: "acme/harness",
    label: "acme/harness",
    branches: ["main", "develop", "feat/agent-pool", "chore/deps"],
    defaultBranch: "develop",
  },
  {
    id: "acme/web",
    label: "acme/web",
    branches: ["main", "staging", "feat/checkout-v2"],
    defaultBranch: "main",
  },
];
