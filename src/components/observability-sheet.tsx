"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Activity, Trash2, X } from "lucide-react";
import ScrambleIn from "@/components/custom/scramble-in";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useObservability } from "@/lib/observability/context";
import type {
  ObservabilityEvent,
  ObservabilityEventKind,
} from "@/lib/observability/types";

const PANEL_WIDTH = 440;

const KIND_STYLES: Record<ObservabilityEventKind, string> = {
  system: "text-zinc-400",
  agent: "text-emerald-600",
  tool: "text-sky-600",
  output: "text-zinc-700",
  error: "text-red-500",
};

/**
 * Events that have already played their scramble-in. Module-level so the
 * decode only runs when a line is first inserted, not on panel reopen.
 */
const scrambledIds = new Set<string>();

function formatTime(timestamp: number) {
  return new Date(timestamp).toLocaleTimeString("en-GB", { hour12: false });
}

export function ObservabilityToggle() {
  const { isOpen, toggle, events } = useObservability();
  return (
    <AnimatePresence initial={false}>
      {!isOpen ? (
        <motion.div
          key="observability-toggle"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.7 }}
          transition={{ duration: 0.14 }}
          whileTap={{ scale: 0.92 }}
        >
          <Button
            variant="outline"
            size="icon"
            onClick={toggle}
            aria-label="Open observability"
            className="relative size-9 rounded-full border-zinc-200 bg-white text-zinc-600 shadow-sm hover:bg-zinc-50 hover:text-zinc-900"
          >
            <Activity className="size-4" />
            {events.length > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-emerald-500" />
            ) : null}
          </Button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function LogLine({ event }: { event: ObservabilityEvent }) {
  const [shouldScramble] = useState(() => !scrambledIds.has(event.id));
  useEffect(() => {
    scrambledIds.add(event.id);
  }, [event.id]);

  return (
    <li className="leading-relaxed">
      <div className="flex items-baseline gap-2">
        <span className="shrink-0 text-zinc-400 tabular-nums">
          {formatTime(event.timestamp)}
        </span>
        <span className={cn("shrink-0 font-semibold", KIND_STYLES[event.kind])}>
          [{event.kind}]
        </span>
        <span className="text-zinc-700">
          {shouldScramble ? (
            <ScrambleIn
              text={event.label}
              scrambleSpeed={12}
              scrambledLetterCount={4}
              scrambledClassName="text-zinc-400"
            />
          ) : (
            event.label
          )}
        </span>
      </div>
      {event.detail ? (
        <div className="pl-[76px] text-zinc-500">
          └{" "}
          {shouldScramble ? (
            <ScrambleIn
              text={event.detail}
              scrambleSpeed={8}
              scrambledLetterCount={5}
              scrambledClassName="text-zinc-300"
            />
          ) : (
            event.detail
          )}
        </div>
      ) : null}
    </li>
  );
}

/**
 * Renders as a flex sibling of the main column: opening reserves its width
 * immediately (pushing the core content aside) while the card fades in.
 */
export function ObservabilitySheet() {
  const { events, isOpen, setOpen, clear } = useObservability();
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [events.length, isOpen]);

  return (
    <AnimatePresence initial={false}>
      {isOpen ? (
        <motion.aside
          key="observability"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="log"
          aria-label="Observability stream"
          className="h-full shrink-0 p-3 pl-0"
          style={{ width: PANEL_WIDTH }}
        >
          {/* Recessed terminal: inset shadows carve it into the page. */}
          <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-300/70 bg-zinc-100 shadow-[inset_0_2px_5px_rgba(0,0,0,0.14),inset_0_10px_24px_rgba(0,0,0,0.07),inset_2px_0_6px_rgba(0,0,0,0.06),inset_-2px_0_6px_rgba(0,0,0,0.06),0_1px_0_rgba(255,255,255,0.95)]">
            <header className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-200 px-4">
              <div className="flex items-baseline gap-2 font-mono text-xs">
                <span className="font-semibold tracking-widest text-zinc-800 uppercase">
                  oscar
                </span>
                <span className="text-zinc-400">·</span>
                <span className="text-zinc-500">observability</span>
                <span className="rounded-full border border-zinc-300 px-1.5 py-px text-[10px] text-zinc-500 tabular-nums">
                  {events.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={clear}
                  aria-label="Clear stream"
                  className="size-8 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700"
                >
                  <Trash2 className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setOpen(false)}
                  aria-label="Close panel"
                  className="size-8 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs [scrollbar-width:thin] [scrollbar-color:#d4d4d8_transparent]">
              {events.length === 0 ? (
                <p className="py-8 text-center text-zinc-400">
                  stream empty — send a prompt to trigger the harness
                </p>
              ) : (
                <ol className="flex flex-col gap-1.5">
                  {events.map((event) => (
                    <LogLine key={event.id} event={event} />
                  ))}
                </ol>
              )}
              <motion.span
                aria-hidden
                animate={{ opacity: [1, 0] }}
                transition={{
                  repeat: Infinity,
                  repeatType: "reverse",
                  duration: 0.6,
                }}
                className="mt-2 inline-block h-3.5 w-2 bg-blue-500/80"
              />
              <div ref={bottomRef} />
            </div>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
