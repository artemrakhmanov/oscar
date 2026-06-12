"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCENT = "#3b82f6";

export interface MiniSelectOption {
  id: string;
  label: React.ReactNode;
}

/**
 * Tiny mono-type select used in the strips above/below the composer card.
 * Borderless trigger; popup opens away from the card (`direction`).
 */
export function MiniSelect({
  icon,
  display,
  options,
  value,
  open,
  onOpenChange,
  onSelect,
  direction = "up",
}: {
  /** Optional small leading icon. */
  icon?: React.ReactNode;
  /** Trigger content (usually the selected value). */
  display: React.ReactNode;
  options: MiniSelectOption[];
  value: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (optionId: string) => void;
  direction?: "up" | "down";
}) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onOpenChange(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onOpenChange(!open)}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
          open
            ? "bg-zinc-200/80 text-zinc-800"
            : "text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800",
        )}
      >
        {icon ? (
          <span className="opacity-70 [&_svg]:size-2.5">{icon}</span>
        ) : null}
        <span>{display}</span>
        <ChevronDown
          className={cn(
            "size-2.5 opacity-50 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            role="listbox"
            initial={{ opacity: 0, y: direction === "up" ? 4 : -4, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: direction === "up" ? 4 : -4, filter: "blur(3px)" }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className={cn(
              "absolute left-0 z-50 w-max min-w-32 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.25)]",
              direction === "up" ? "bottom-full mb-1.5" : "top-full mt-1.5",
            )}
          >
            {options.map((option) => {
              const active = option.id === value;
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => onSelect(option.id)}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 px-2.5 py-1 text-left font-mono text-[10px] transition-colors",
                      active
                        ? "text-zinc-900"
                        : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
                    )}
                  >
                    <span>{option.label}</span>
                    {active ? (
                      <span
                        className="size-1 shrink-0 rounded-full"
                        style={{ background: ACCENT }}
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
