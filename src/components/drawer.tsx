"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronUp, Loader2, Wand2 } from "lucide-react";
import { Notch, type NotchItem } from "@/components/custom/notch";
import { ClarifyPanel } from "@/components/clarify-panel";
import { cn } from "@/lib/utils";
import {
  attentionItems,
  type ClarifyQuestion,
} from "@/lib/oscar/clarify";
import { summarizeContent } from "@/lib/oscar/ledger";
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

/** The notch cycles "All" (flat attention list) plus the five dimensions. */
type ViewId = Dimension | "all";

/**
 * The OSCAR top drawer: a thin strip extending from the top of the composer
 * card, rendered live from the harness ledger. The notch cycles All + the
 * five dimensions; the points panel pulls up above it; the research queue
 * hides in an accordion; the clarify wizard takes the panel over when active.
 */
export function Drawer({
  snapshot,
  promptText,
  onAppend,
}: {
  snapshot: HarnessSnapshot;
  /** Current composer text — what clarify questions are generated against. */
  promptText: string;
  /** Append a clarification block to the composer. */
  onAppend: (block: string) => void;
}) {
  const [viewId, setViewId] = useState<ViewId>("all");
  const [open, setOpen] = useState(false);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [clarify, setClarify] = useState<
    { state: "idle" } | { state: "loading" } | { state: "ready"; questions: ClarifyQuestion[] }
  >({ state: "idle" });
  const clarifyAbort = useRef<AbortController | null>(null);

  const { ledger, tasks, scoutReason, phase } = snapshot;
  const byDimension = (d: Dimension): OscarItem[] =>
    ledger.items.filter((i) => i.dimension === d);

  const attention = attentionItems(ledger.items).map((item) => ({
    item,
    display: displayItem(item),
  }));

  const isAll = viewId === "all";
  const viewItems: OscarItem[] = isAll
    ? attention.map((a) => a.item)
    : byDimension(viewId);
  const viewHint = isAll
    ? "every point that may need attention"
    : DIMENSION_META[viewId].hint;
  const viewLetter = isAll ? "✱" : DIMENSION_META[viewId].letter;
  const viewEmpty = isAll
    ? "nothing needs attention"
    : "nothing here yet — keep typing";

  const startClarify = async () => {
    if (clarify.state === "loading" || attention.length === 0) return;
    setOpen(true);
    setClarify({ state: "loading" });
    clarifyAbort.current?.abort();
    const controller = new AbortController();
    clarifyAbort.current = controller;
    try {
      const res = await fetch("/api/oscar/clarify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptText,
          items: attention.map(({ item, display }) => ({
            id: item.id,
            dimension: item.dimension,
            summary: summarizeContent(item),
            severity: display.severity,
            evidence: item.evidence,
          })),
        }),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`clarify ${res.status}`);
      const { questions } = (await res.json()) as { questions: ClarifyQuestion[] };
      setClarify(
        questions.length > 0 ? { state: "ready", questions } : { state: "idle" },
      );
    } catch {
      if (!controller.signal.aborted) setClarify({ state: "idle" });
    }
  };

  const commitClarify = (block: string) => {
    setClarify({ state: "idle" });
    if (block) onAppend(block);
  };

  const worstSeverity: DisplaySeverity = attention.some(
    (a) => a.display.severity === "high",
  )
    ? "high"
    : "mid";

  const viewLabel = (v: ViewId) => (
    <span className="flex items-baseline gap-2">
      <span className="font-mono text-[10px] opacity-60 tabular-nums">
        {v === "all" ? attention.length : byDimension(v).length}
      </span>
      {v === "all" ? "All" : DIMENSION_META[v].label}
    </span>
  );

  const notchItems: NotchItem[] = [
    {
      id: "dimension",
      label: viewLabel(viewId),
      showValue: false,
      value: viewId,
      onChange: (id) => {
        setViewId(id as ViewId);
        setOpen(true);
      },
      options: (["all", ...DIMENSIONS] as ViewId[]).map((v) => ({
        id: v,
        label: viewLabel(v),
      })),
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
            {clarify.state === "ready" ? (
              // The wizard takes over the panel while clarifying.
              <ClarifyPanel
                questions={clarify.questions}
                onCommit={commitClarify}
                onCancel={() => setClarify({ state: "idle" })}
              />
            ) : (
              <div className="px-3 pt-2 pb-1">
                <p className="font-mono text-[9px] tracking-wide text-zinc-400">
                  {viewLetter} · {viewHint}
                </p>
                <ul className="mt-1.5 flex flex-col gap-1 pb-1">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {viewItems.length === 0 ? (
                      <motion.li
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="font-mono text-[10px] text-zinc-400"
                      >
                        {viewEmpty}
                      </motion.li>
                    ) : (
                      viewItems.map((item, index) => {
                        const display = displayItem(item);
                        const tag = isAll
                          ? DIMENSION_META[item.dimension].letter
                          : `${viewLetter}${index + 1}`;
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
                            <span className="w-4 shrink-0 font-mono text-[9px] text-zinc-400 tabular-nums">
                              {tag}
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

                {/* Research queue — accordion, collapsed by default. */}
                {visibleTasks.length > 0 ? (
                  <div className="mt-1 border-t border-zinc-200/80 pt-1 pb-1">
                    <button
                      type="button"
                      onClick={() => setTasksOpen((v) => !v)}
                      aria-expanded={tasksOpen}
                      className="flex w-full items-center justify-between rounded px-0.5 py-0.5 font-mono text-[9px] tracking-wide text-zinc-400 transition-colors hover:text-zinc-600"
                    >
                      <span className="flex items-center gap-1.5">
                        <span className="size-1.5 animate-pulse rounded-full bg-blue-400" />
                        research queue ·{" "}
                        {visibleTasks.filter((t) => t.status === "queued").length}{" "}
                        would dispatch on send
                      </span>
                      <motion.span
                        animate={{ rotate: tasksOpen ? 180 : 0 }}
                        transition={SPRING}
                        className="block"
                      >
                        <ChevronDown className="size-3" />
                      </motion.span>
                    </button>
                    <AnimatePresence initial={false}>
                      {tasksOpen ? (
                        <motion.ul
                          key="tasks"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={SPRING}
                          className="mt-1 flex flex-col gap-1 overflow-hidden"
                        >
                          {visibleTasks.map((task) => (
                            <li
                              key={task.triggeredBy}
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
                            </li>
                          ))}
                        </motion.ul>
                      ) : null}
                    </AnimatePresence>
                  </div>
                ) : null}
              </div>
            )}
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
        {/* Bottom-pinned anchor: the open panel grows upward, like the
            composer's param notch — there's no screen below the strip. */}
        <div className="relative h-7 shrink-0">
          <div className="absolute bottom-0 left-0">
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
            {isAll ? "All" : DIMENSION_META[viewId].label}····
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
                setViewId("all");
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
          {attention.length > 0 ? (
            <button
              type="button"
              onClick={startClarify}
              disabled={clarify.state === "loading"}
              title="Generate clarifying questions for the open points"
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] text-blue-600 transition-colors hover:bg-blue-500/10 disabled:opacity-60"
            >
              {clarify.state === "loading" ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <Wand2 className="size-2.5" />
              )}
              fix
            </button>
          ) : null}
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
