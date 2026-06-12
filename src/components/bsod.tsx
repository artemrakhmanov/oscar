"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";

/**
 * The blue screen of death — sending the prompt "crashes" the mock OS.
 * Any key or click (or the progress counter completing) restarts the app;
 * the workspace resets everything on the way back.
 */
export function Bsod({ onRestart }: { onRestart: () => void }) {
  const [percent, setPercent] = useState(0);
  const restarted = useRef(false);

  const restart = () => {
    if (restarted.current) return;
    restarted.current = true;
    onRestart();
  };
  const restartRef = useRef(restart);
  restartRef.current = restart;

  // Progress counter: lurches upward like the real thing, restarts at 100%.
  useEffect(() => {
    let value = 0;
    const tick = () => {
      value = Math.min(100, value + Math.ceil(Math.random() * 14));
      setPercent(value);
      if (value >= 100) {
        window.setTimeout(() => restartRef.current(), 900);
        return;
      }
      timer = window.setTimeout(tick, 350 + Math.random() * 550);
    };
    let timer = window.setTimeout(tick, 500);
    return () => window.clearTimeout(timer);
  }, []);

  // Any key or click returns from the crash.
  useEffect(() => {
    const onAny = () => restartRef.current();
    window.addEventListener("keydown", onAny);
    window.addEventListener("pointerdown", onAny);
    return () => {
      window.removeEventListener("keydown", onAny);
      window.removeEventListener("pointerdown", onAny);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: 0.12 } }}
      className="fixed inset-0 z-[200] flex cursor-default items-center bg-[#0078d7] text-white select-none"
      style={{ fontFamily: "'Segoe UI', system-ui, sans-serif" }}
      role="alertdialog"
      aria-label="Blue screen of death"
    >
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-8">
        <span className="text-[110px] leading-none font-light">:(</span>
        <p className="text-2xl leading-snug font-light">
          Your prompt ran into a problem and needs to restart. We&apos;re just
          collecting some error info, and then we&apos;ll restart for you.
        </p>
        <p className="text-2xl font-light tabular-nums">{percent}% complete</p>
        <div className="mt-2 flex flex-col gap-1 text-sm font-light opacity-90">
          <p>
            For more information about this issue and possible fixes, visit
            https://oscar.local/stopcode
          </p>
          <p className="mt-3">If you call a support person, give them this info:</p>
          <p>Stop code: OSCAR_LEDGER_OVERCOMMIT</p>
          <p>What failed: comprehension_mirror.sys</p>
        </div>
        <p className="mt-4 text-xs font-light opacity-60">
          press any key to return — everything will be reset
        </p>
      </div>
    </motion.div>
  );
}
