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
