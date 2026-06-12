"use client";

import { motion } from "motion/react";

/**
 * Placeholder for the OSCAR analysis drawer (Phase 2). Expands above the
 * composer; collapsed to zero height until the analysis loop exists.
 */
export function Drawer({ open = false }: { open?: boolean }) {
  return (
    <motion.div
      initial={false}
      animate={{ height: open ? "auto" : 0, opacity: open ? 1 : 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34 }}
      className="overflow-hidden"
      aria-hidden={!open}
    />
  );
}
