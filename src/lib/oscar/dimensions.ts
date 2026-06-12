import type {
  AmbiguityContent,
  ConstraintContent,
  Dimension,
  OscarItem,
  RiskContent,
  ScopeContent,
} from "./types";

/** Registry: letter, label, one-line framing — drives the drawer chrome. */
export const DIMENSION_META: Record<
  Dimension,
  { letter: string; label: string; hint: string }
> = {
  objectives: {
    letter: "O",
    label: "Objectives",
    hint: "what the agent thinks you're trying to achieve",
  },
  scope: {
    letter: "S",
    label: "Scope",
    hint: "the implied blast radius of the change",
  },
  constraints: {
    letter: "C",
    label: "Constraints",
    hint: "rules the work must obey",
  },
  ambiguities: {
    letter: "A",
    label: "Ambiguities",
    hint: "places the agent could go two different ways",
  },
  risks: {
    letter: "R",
    label: "Risks",
    hint: "failure modes inferred from your instruction",
  },
};

export type DisplaySeverity = "low" | "mid" | "high";

/** Flatten a per-dimension content payload into drawer-renderable text + urgency. */
export function displayItem(item: OscarItem): {
  text: string;
  severity: DisplaySeverity;
} {
  switch (item.dimension) {
    case "objectives":
      return { text: (item.content as { text: string }).text, severity: "low" };
    case "scope": {
      const c = item.content as ScopeContent;
      return { text: c.text, severity: c.kind === "direct" ? "low" : "mid" };
    }
    case "constraints": {
      const c = item.content as ConstraintContent;
      return { text: c.text, severity: c.severity === "hard" ? "mid" : "low" };
    }
    case "ambiguities": {
      const c = item.content as AmbiguityContent;
      return {
        text: c.question,
        severity: c.interpretations.length >= 2 ? "high" : "mid",
      };
    }
    case "risks": {
      const c = item.content as RiskContent;
      const map = { low: "low", medium: "mid", high: "high" } as const;
      return { text: c.text, severity: map[c.likelihood] };
    }
  }
}
