"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronUp } from "lucide-react";
import { Notch, type NotchItem } from "@/components/custom/notch";
import { cn } from "@/lib/utils";
import {
  OSCAR_DIMENSIONS,
  type OscarDimensionId,
  type OscarSeverity,
} from "@/lib/mock-data";

const SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

const ACCENT = "#3b82f6";

const SEVERITY_BUBBLES: Record<OscarSeverity, string> = {
  low: "bg-zinc-300",
  mid: "bg-orange-400",
  high: "bg-red-500",
};

/**
 * The OSCAR top drawer: a thin strip extending from the top of the composer
 * card. One notch cycles the five dimensions; the points panel pulls up
 * above it. Static placeholder — points come from mock data for now.
 */
export function Drawer() {
  const [dimensionId, setDimensionId] =
    useState<OscarDimensionId>("objectives");
  const [open, setOpen] = useState(false);

  const dimension =
    OSCAR_DIMENSIONS.find((d) => d.id === dimensionId) ?? OSCAR_DIMENSIONS[0];

  const attention = OSCAR_DIMENSIONS.flatMap((d) =>
    d.points
      .filter((p) => p.severity !== "low")
      .map((p) => ({ dimension: d, point: p })),
  );
  const firstAttentionDimension = attention[0]?.dimension.id;
  const worstSeverity: OscarSeverity = attention.some(
    (a) => a.point.severity === "high",
  )
    ? "high"
    : "mid";

  const notchItems: NotchItem[] = [
    {
      id: "dimension",
      label: (
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-[10px] opacity-60 tabular-nums">
            {dimension.points.length}
          </span>
          {dimension.label}
        </span>
      ),
      showValue: false,
      value: dimensionId,
      onChange: (id) => {
        setDimensionId(id as OscarDimensionId);
        setOpen(true);
      },
      options: OSCAR_DIMENSIONS.map((d) => ({
        id: d.id,
        label: (
          <span className="flex items-baseline gap-2">
            <span className="font-mono text-[10px] opacity-60 tabular-nums">
              {d.points.length}
            </span>
            {d.label}
          </span>
        ),
      })),
    },
  ];

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
                {dimension.letter} · {dimension.hint}
              </p>
              <ul className="mt-1.5 flex flex-col gap-1 pb-1">
                <AnimatePresence mode="popLayout" initial={false}>
                  {dimension.points.map((point, index) => (
                    <motion.li
                      key={`${dimension.id}-${point.id}`}
                      layout
                      initial={{ opacity: 0, y: 6, filter: "blur(3px)" }}
                      animate={{
                        opacity: 1,
                        y: 0,
                        filter: "blur(0px)",
                        transition: { ...SPRING, delay: index * 0.045 },
                      }}
                      exit={{ opacity: 0, transition: { duration: 0.08 } }}
                      className="flex items-baseline gap-2"
                    >
                      <span className="shrink-0 font-mono text-[9px] text-zinc-400 tabular-nums">
                        {dimension.letter}
                        {index + 1}
                      </span>
                      <span className="flex-1 text-[11px] leading-snug text-zinc-600">
                        {point.text}
                      </span>
                      <span
                        className={cn(
                          "size-1.5 shrink-0 self-center rounded-full",
                          SEVERITY_BUBBLES[point.severity],
                        )}
                      />
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {/* Strip — mirrors the git under-card, attached to the card's top edge. */}
      <div
        className={cn(
          "flex h-8 items-center justify-between border border-b-0 border-zinc-200/80 bg-zinc-100/90 px-1.5",
          !open && "rounded-t-lg",
        )}
      >
        <div className="relative h-7">
          <div className="absolute top-0 left-0">
            <Notch
              floating={false}
              bare
              items={notchItems}
              accentColor={ACCENT}
              reveal={false}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
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
              nothing needs attention
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
