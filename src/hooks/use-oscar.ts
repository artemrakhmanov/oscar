"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import {
  OscarHarness,
  type HarnessEventInput,
  type HarnessSnapshot,
} from "@/lib/oscar/harness";

/**
 * React binding for the OSCAR harness. The harness itself is framework-free;
 * this hook owns its lifecycle and subscribes the component to its snapshots.
 */
export function useOscar(onEvent?: (event: HarnessEventInput) => void): {
  snapshot: HarnessSnapshot;
  onTextChange: (text: string, opts?: { isPaste?: boolean }) => void;
  reset: () => void;
} {
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const harness = useMemo(
    () => new OscarHarness({ onEvent: (e) => onEventRef.current?.(e) }),
    [],
  );

  const snapshot = useSyncExternalStore(
    harness.subscribe,
    harness.getSnapshot,
    harness.getSnapshot,
  );

  return useMemo(
    () => ({
      snapshot,
      onTextChange: (text: string, opts?: { isPaste?: boolean }) =>
        harness.onTextChange(text, opts),
      reset: () => harness.reset(),
    }),
    [harness, snapshot],
  );
}
