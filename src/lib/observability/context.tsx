"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type {
  ObservabilityEvent,
  ObservabilityEventInput,
} from "./types";

/** Oldest events are dropped past this point so the log can stream forever. */
const MAX_EVENTS = 200;

interface ObservabilityContextValue {
  events: ObservabilityEvent[];
  isOpen: boolean;
  pushEvent: (event: ObservabilityEventInput) => void;
  clear: () => void;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const ObservabilityContext = createContext<ObservabilityContextValue | null>(
  null,
);

export function ObservabilityProvider({
  initialEvents = [],
  children,
}: {
  initialEvents?: ObservabilityEvent[];
  children: React.ReactNode;
}) {
  const [events, setEvents] = useState<ObservabilityEvent[]>(initialEvents);
  const [isOpen, setOpen] = useState(false);

  const pushEvent = useCallback((input: ObservabilityEventInput) => {
    setEvents((prev) => {
      const event: ObservabilityEvent = {
        ...input,
        id: input.id ?? crypto.randomUUID(),
        timestamp: input.timestamp ?? Date.now(),
      };
      const next = [...prev, event];
      return next.length > MAX_EVENTS ? next.slice(-MAX_EVENTS) : next;
    });
  }, []);

  const clear = useCallback(() => setEvents([]), []);
  const toggle = useCallback(() => setOpen((v) => !v), []);

  const value = useMemo(
    () => ({ events, isOpen, pushEvent, clear, setOpen, toggle }),
    [events, isOpen, pushEvent, clear, toggle],
  );

  return (
    <ObservabilityContext.Provider value={value}>
      {children}
    </ObservabilityContext.Provider>
  );
}

export function useObservability() {
  const ctx = useContext(ObservabilityContext);
  if (!ctx) {
    throw new Error(
      "useObservability must be used within an <ObservabilityProvider>",
    );
  }
  return ctx;
}
