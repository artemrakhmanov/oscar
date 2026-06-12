"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp } from "lucide-react";
import { Notch, type NotchItem } from "@/components/custom/notch";
import { cn } from "@/lib/utils";
import { DIMENSION_META, displayItem, type DisplaySeverity } from "@/lib/oscar/dimensions";
import { DIMENSIONS, type Dimension, type OscarItem } from "@/lib/oscar/types";
import type { HarnessSnapshot } from "@/lib/oscar/harness";

const SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

const ACCENT = "#3b82f6";

const SEVERITY_BUBBLES: Record<DisplaySeverity, string> = {
  low: "bg-zinc-300",
  mid: "bg-orange-400",
  high: "bg-red-500",
};

const ROLE_LABELS: Record<string, string> = {
  "codebase-scout": "scout",
  "docs-reader": "docs",
  "impact-analyzer": "impact",
  "convention-checker": "conventions",
};

/**
 * The OSCAR top drawer: a thin strip extending from the top of the composer
 * card, rendered live from the harness ledger. One notch cycles the five
 * dimensions; the points panel pulls up above it; the dispatch queue and the
 * scout's inner monologue ride along.
 */
export function Drawer({ snapshot }: { snapshot: HarnessSnapshot }) {
  const [dimensionId, setDimensionId] = useState<Dimension>("objectives");
  const [open, setOpen] = useState(false);

  const { ledger, tasks, scoutReason, phase } = snapshot;
  const byDimension = (d: Dimension): OscarItem[] =>
    ledger.items.filter((i) => i.dimension === d);

  const meta = DIMENSION_META[dimensionId];
  const items = byDimension(dimensionId);

  const attention = ledger.items
    .filter((i) => i.status !== "invalidated")
    .map((i) => ({ item: i, display: displayItem(i) }))
    .filter((x) => x.display.severity !== "low");
  const firstAttentionDimension = attention[0]?.item.dimension;
  const worstSeverity: DisplaySeverity = attention.some(
    (a) => a.display.severity === "high",
  )
    ? "high"
    : "mid";

  const dimensionLabel = (d: Dimension) => (
    <span className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] opacity-60 tabular-nums">
        {byDimension(d).length}
      </span>
      {DIMENSION_META[d].label}
    </span>
  );

  const notchItems: NotchItem[] = [
    {
      id: "dimension",
      label: dimensionLabel(dimensionId),
      showValue: false,
      value: dimensionId,
      onChange: (id) => {
        setDimensionId(id as Dimension);
        setOpen(true);
      },
      options: DIMENSIONS.map((d) => ({ id: d, label: dimensionLabel(d) })),
    },
  ];

  const visibleTasks = tasks.filter(
    (t) => t.status === "queued" || t.status === "cancelled",
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ ...SPRING, delay: 0.1 }}
      className="relative z-20 mx-4"
    >
      {/* Points panel — pulls up above the strip. */}
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="points"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={SPRING}
            className="overflow-hidden rounded-t-lg border border-b-0 border-zinc-200/80 bg-zinc-100/90"
          >
            <div className="px-3 pt-2 pb-1">
              <p className="font-mono text-[9px] tracking-wide text-zinc-400">
                {meta.letter} · {meta.hint}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 pb-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {items.length === 0 ? (
                    <motion.li
                      key="empty"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="font-mono text-[10px] text-zinc-400"
                    >
                      nothing here yet — keep typing
                    </motion.li>
                  ) : (
                    items.map((item, index) => {
                      const display = displayItem(item);
                      return (
                        <motion.li
                          key={item.id}
                          layout
                          initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                          animate={{
                            opacity: 1,
                            y: 0,
                            filter: "blur(0px)",
                            transition: { ...SPRING, delay: index * 0.045 },
                          }}
                          exit={{ opacity: 0, transition: { duration: 0.08 } }}
                          className={cn(
                            "flex items-baseline gap-2 transition-opacity",
                            item.status === "stale" && "opacity-55",
                            item.status === "invalidated" && "opacity-35",
                          )}
                        >
                          <span className="shrink-0 font-mono text-[9px] text-zinc-400 tabular-nums">
                            {meta.letter}
                            {index + 1}
                          </span>
                          <span
                            className={cn(
                              "flex-1 text-[11px] leading-snug text-zinc-600",
                              item.status === "invalidated" && "line-through",
                            )}
                            title={`evidence: “${item.evidence}”`}
                          >
                            {display.text}
                          </span>
                          {item.status === "stale" ? (
                            <span className="size-1.5 shrink-0 animate-pulse self-center rounded-full bg-zinc-400" />
                          ) : (
                            <span
                              className={cn(
                                "size-1.5 shrink-0 self-center rounded-full",
                                SEVERITY_BUBBLES[display.severity],
                              )}
                            />
                          )}
                        </motion.li>
                      );
                    })
                  )}
                </AnimatePresence>
              </ul>

              {/* Dispatch queue — research agents that would launch on send. */}
              {visibleTasks.length > 0 ? (
                <div className="mt-1 border-t border-zinc-200/80 pt-1.5 pb-1">
                  <p className="font-mono text-[9px] tracking-wide text-zinc-400">
                    research queue · would dispatch on send
                  </p>
                  <ul className="mt-1 flex flex-col gap-1">
                    <AnimatePresence mode="popLayout" initial={false}>
                      {visibleTasks.map((task) => (
                        <motion.li
                          key={task.triggeredBy}
                          layout
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0, transition: SPRING }}
                          exit={{ opacity: 0, transition: { duration: 0.12 } }}
                          className={cn(
                            "flex items-baseline gap-2",
                            task.status === "cancelled" && "opacity-35",
                          )}
                          title={task.prompt}
                        >
                          <span
                            className={cn(
                              "size-1.5 shrink-0 self-center rounded-full",
                              task.status === "queued"
                                ? "animate-pulse bg-blue-400"
                                : "bg-zinc-300",
                            )}
                          />
                          <span className="shrink-0 rounded bg-zinc-200/80 px-1 font-mono text-[9px] text-zinc-500">
                            {ROLE_LABELS[task.agentRole] ?? task.agentRole}
                          </span>
                          <span
                            className={cn(
                              "flex-1 truncate text-[10px] leading-snug text-zinc-500",
                              task.status === "cancelled" && "line-through",
                            )}
                          >
                            {task.expectedOutput}
                          </span>
                        </motion.li>
                      ))}
                    </AnimatePresence>
                  </ul>
                </div>
              ) : null}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Strip — mirrors the git under-card, attached to the card's top edge. */}
      <div
        className={cn(
          "flex h-8 items-center justify-between gap-2 border border-b-0 border-zinc-200/80 bg-zinc-100/90 px-1.5",
          !open && "rounded-t-lg",
        )}
      >
        <div className="relative h-7 shrink-0">
          <div className="absolute top-0 left-0">
            <Notch
              floating={false}
              bare
              items={notchItems}
              accentColor={ACCENT}
              reveal={false}
            />
          </div>
          {/* Width reserve for the absolutely-positioned notch. */}
          <div className="invisible h-7 px-2 font-mono text-[10px]">
            {DIMENSION_META[dimensionId].label}····
          </div>
        </div>

        {/* The scout's inner monologue — the visible heartbeat. */}
        <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5">
          {phase !== "idle" || scoutReason ? (
            <span className="flex min-w-0 items-center gap-1.5 font-mono text-[9px] text-zinc-400">
              <span
                className={cn(
                  "size-1.5 shrink-0 rounded-full",
                  phase === "analyzing" && "animate-pulse bg-blue-500",
                  phase === "consulting" && "animate-pulse bg-zinc-400",
                  phase === "idle" && "bg-zinc-300",
                )}
              />
              <span className="truncate italic">
                {phase === "analyzing"
                  ? `analyzing… ${scoutReason ?? ""}`
                  : (scoutReason ?? "listening")}
              </span>
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {attention.length > 0 ? (
            <button
              type="button"
              onClick={() => {
                if (firstAttentionDimension) {
                  setDimensionId(firstAttentionDimension);
                }
                setOpen(true);
              }}
              className="flex items-center gap-1.5 rounded px-1.5 py-0.5 font-mono text-[9px] text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700"
            >
              <span
                className={cn(
                  "size-1.5 rounded-full",
                  SEVERITY_BUBBLES[worstSeverity],
                )}
              />
              {attention.length} points may need attention
            </button>
          ) : (
            <span className="flex items-center gap-1.5 font-mono text-[9px] text-zinc-400">
              <span className="size-1.5 rounded-full bg-zinc-300" />
              {ledger.items.length === 0
                ? "oscar is listening"
                : "nothing needs attention"}
            </span>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? "Collapse drawer" : "Expand drawer"}
            aria-expanded={open}
            className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700"
          >
            <motion.span
              animate={{ rotate: open ? 180 : 0 }}
              transition={SPRING}
              className="block"
            >
              <ChevronUp className="size-3" />
            </motion.span>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
