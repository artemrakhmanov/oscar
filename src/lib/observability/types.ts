export type ObservabilityEventKind =
  | "system"
  | "agent"
  | "tool"
  | "output"
  | "error";

export interface ObservabilityEvent {
  id: string;
  kind: ObservabilityEventKind;
  /** Primary log line, e.g. "harness triggered", "research agent launched". */
  label: string;
  /** Optional secondary/output line rendered indented under the label. */
  detail?: string;
  /** Emitting subsystem, e.g. "harness" | "research-agent". */
  source?: string;
  timestamp: number;
}

/** What callers pass to pushEvent — id/timestamp are filled in if omitted. */
export type ObservabilityEventInput = Omit<
  ObservabilityEvent,
  "id" | "timestamp"
> &
  Partial<Pick<ObservabilityEvent, "id" | "timestamp">>;
