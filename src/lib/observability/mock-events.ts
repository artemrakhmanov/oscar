import type {
  ObservabilityEvent,
  ObservabilityEventInput,
} from "./types";

let bootStamp = 0;
function boot(
  kind: ObservabilityEvent["kind"],
  label: string,
  detail?: string,
): ObservabilityEvent {
  bootStamp += 1;
  return {
    id: `boot-${bootStamp}`,
    kind,
    label,
    detail,
    source: "harness",
    timestamp: Date.now() - (5 - bootStamp) * 1200,
  };
}

export const INITIAL_EVENTS: ObservabilityEvent[] = [
  boot("system", "oscar harness initialized", "v0.1.0 · session 4f2a"),
  boot("system", "watching composer input"),
  boot("output", "5 dimension agents registered", "O · S · C · A · R"),
  boot("system", "idle — waiting for prompt"),
];

type Step = { delay: number; event: ObservabilityEventInput };

function runSteps(steps: Step[], push: (e: ObservabilityEventInput) => void) {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let at = 0;
  for (const step of steps) {
    at += step.delay;
    timers.push(setTimeout(() => push(step.event), at));
  }
  return () => timers.forEach(clearTimeout);
}

/**
 * Replays a scripted "harness run" into the observability stream, as if a
 * real send had triggered analysis agents. Returns a cancel function.
 */
export function replayMockRun(
  push: (e: ObservabilityEventInput) => void,
  meta?: { model?: string; mode?: string; repo?: string; branch?: string },
) {
  const target = meta?.repo
    ? `${meta.repo}@${meta.branch ?? "main"}`
    : "workspace";
  const model = meta?.model ?? "gpt-5.1-codex";

  return runSteps(
    [
      {
        delay: 150,
        event: {
          kind: "system",
          source: "harness",
          label: "harness triggered",
          detail: `model=${model} · mode=${meta?.mode ?? "code"} · target=${target}`,
        },
      },
      {
        delay: 400,
        event: {
          kind: "tool",
          source: "harness",
          label: "prompt snapshot captured",
          detail: "hash 9c41e2 · debounce window closed",
        },
      },
      {
        delay: 350,
        event: {
          kind: "agent",
          source: "objectives-agent",
          label: "research agent launched · objectives",
        },
      },
      {
        delay: 220,
        event: {
          kind: "agent",
          source: "scope-agent",
          label: "research agent launched · scope",
        },
      },
      {
        delay: 180,
        event: {
          kind: "agent",
          source: "constraints-agent",
          label: "research agent launched · constraints",
        },
      },
      {
        delay: 600,
        event: {
          kind: "output",
          source: "objectives-agent",
          label: "objectives resolved",
          detail: "2 objectives extracted from prompt",
        },
      },
      {
        delay: 450,
        event: {
          kind: "tool",
          source: "scope-agent",
          label: "scanning implied blast radius",
          detail: "src/** · no migrations touched",
        },
      },
      {
        delay: 700,
        event: {
          kind: "output",
          source: "scope-agent",
          label: "scope inferred",
          detail: "3 in-scope · 1 unstated boundary",
        },
      },
      {
        delay: 500,
        event: {
          kind: "agent",
          source: "ambiguities-agent",
          label: "research agent launched · ambiguities",
        },
      },
      {
        delay: 800,
        event: {
          kind: "error",
          source: "ambiguities-agent",
          label: "ambiguity flagged",
          detail: '"the input" could mean composer or search bar',
        },
      },
      {
        delay: 650,
        event: {
          kind: "output",
          source: "harness",
          label: "run complete",
          detail: "5/5 dimensions reported · 1.9s",
        },
      },
      {
        delay: 300,
        event: {
          kind: "system",
          source: "harness",
          label: "idle — waiting for prompt",
        },
      },
    ],
    push,
  );
}
