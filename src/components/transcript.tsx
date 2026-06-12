"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { AboutOverlay } from "@/components/about-overlay";
import { cn } from "@/lib/utils";
import type { TranscriptMessage } from "@/lib/mock-data";

const MESSAGE_SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

const LIST_VARIANTS = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05, delayChildren: 0.15 } },
};

const MESSAGE_VARIANTS = {
  hidden: { opacity: 0, y: 12, filter: "blur(4px)" },
  visible: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: MESSAGE_SPRING,
  },
};

export function Transcript({ messages }: { messages: TranscriptMessage[] }) {
  const endRef = useRef<HTMLDivElement>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <motion.div
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ ...MESSAGE_SPRING, delay: 0.2 }}
          className="text-center select-none"
        >
          <p className="font-mono text-[10px] tracking-wide text-zinc-400">
            starts working before you hit send
            <button
              type="button"
              onClick={() => setAboutOpen(true)}
              className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-600"
            >
              , <span className="underline underline-offset-2">learn more</span>
            </button>
          </p>
        </motion.div>
        <AboutOverlay open={aboutOpen} onClose={() => setAboutOpen(false)} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto py-8 [scrollbar-width:thin]">
      <motion.ol
        className="flex flex-col gap-5"
        variants={LIST_VARIANTS}
        initial="hidden"
        animate="visible"
      >
        <AnimatePresence initial={false} mode="popLayout">
          {messages.map((message) => (
            <motion.li
              key={message.id}
              layout
              variants={MESSAGE_VARIANTS}
              initial="hidden"
              animate="visible"
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              {message.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-md border border-zinc-200 bg-zinc-100/80 px-4 py-2.5 text-sm leading-relaxed text-zinc-800">
                  {message.content}
                </div>
              ) : (
                <div className="flex max-w-[92%] gap-3">
                  <span
                    aria-hidden
                    className="mt-1 flex size-5 shrink-0 items-center justify-center rounded-md bg-zinc-900 font-mono text-[9px] font-bold text-zinc-50"
                  >
                    O
                  </span>
                  <div className="text-sm leading-relaxed text-zinc-700">
                    {message.content}
                  </div>
                </div>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ol>
      <div ref={endRef} />
    </div>
  );
}
