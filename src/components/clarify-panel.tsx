"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatClarifications,
  isAnswered,
  type ClarifyAnswer,
  type ClarifyQuestion,
} from "@/lib/oscar/clarify";

const SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

/**
 * The clarify wizard: one question at a time, answers as a vertical list,
 * free-form always available. The final step submits all collected answers
 * as a clarification block appended to the prompt. Replaces the points panel
 * while active.
 */
export function ClarifyPanel({
  questions,
  onCommit,
  onCancel,
}: {
  questions: ClarifyQuestion[];
  onCommit: (block: string) => void;
  onCancel: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<
    Record<string, { option: string | null; freeform: string }>
  >(() =>
    Object.fromEntries(questions.map((q) => [q.id, { option: null, freeform: "" }])),
  );

  const q = questions[index];
  const a = answers[q.id];
  const isLast = index === questions.length - 1;

  const toAnswer = (question: ClarifyQuestion): ClarifyAnswer => ({
    question,
    option: answers[question.id]?.option ?? null,
    freeform: answers[question.id]?.freeform ?? "",
  });

  const answeredCount = questions.filter((question) =>
    isAnswered(toAnswer(question)),
  ).length;

  const setOption = (option: string) =>
    setAnswers((prev) => ({
      ...prev,
      [q.id]: {
        ...prev[q.id],
        option: prev[q.id]?.option === option ? null : option,
      },
    }));

  const setFreeform = (freeform: string) =>
    setAnswers((prev) => ({ ...prev, [q.id]: { ...prev[q.id], freeform } }));

  const advance = () => {
    if (!isLast) {
      setIndex((i) => i + 1);
      return;
    }
    onCommit(formatClarifications(questions.map(toAnswer)));
  };

  return (
    <div className="px-3 pt-2 pb-2.5">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[9px] tracking-wide text-zinc-400 tabular-nums">
          clarify · {index + 1}/{questions.length} · answers are appended to your
          prompt
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Dismiss clarifications"
          className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-200/70 hover:text-zinc-600"
        >
          <X className="size-3" />
        </button>
      </div>

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={q.id}
          initial={{ opacity: 0, x: 14, filter: "blur(3px)" }}
          animate={{ opacity: 1, x: 0, filter: "blur(0px)", transition: SPRING }}
          exit={{ opacity: 0, x: -14, transition: { duration: 0.1 } }}
          className="mt-1.5"
        >
          <p className="text-[11px] leading-snug font-medium text-zinc-700">
            {q.question}
          </p>

          {/* Vertical answer list. */}
          <div className="mt-1.5 flex flex-col gap-1">
            {q.options.map((option) => {
              const selected = a?.option === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setOption(option)}
                  className={cn(
                    "flex items-center gap-2 rounded-md border px-2 py-1 text-left text-[11px] leading-snug transition-colors",
                    selected
                      ? "border-blue-500 bg-blue-500/10 text-blue-700"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                  )}
                >
                  <span
                    className={cn(
                      "size-2 shrink-0 rounded-full border",
                      selected
                        ? "border-blue-500 bg-blue-500"
                        : "border-zinc-300 bg-transparent",
                    )}
                  />
                  {option}
                </button>
              );
            })}
            <input
              value={a?.freeform ?? ""}
              onChange={(e) => setFreeform(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  advance();
                }
              }}
              placeholder={a?.option ? "add detail…" : "or type your own…"}
              className="rounded-md border border-dashed border-zinc-300 bg-transparent px-2 py-1 text-[11px] text-zinc-700 outline-none placeholder:text-zinc-400 focus:border-zinc-400"
            />
          </div>
        </motion.div>
      </AnimatePresence>

      <div className="mt-2.5 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {index > 0 ? (
            <button
              type="button"
              onClick={() => setIndex((i) => i - 1)}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] text-zinc-500 transition-colors hover:bg-zinc-200/70 hover:text-zinc-700"
            >
              <ArrowLeft className="size-2.5" />
              back
            </button>
          ) : null}
          <span className="font-mono text-[9px] text-zinc-400 tabular-nums">
            {answeredCount}/{questions.length} answered
          </span>
        </div>
        <button
          type="button"
          disabled={isLast && answeredCount === 0}
          onClick={advance}
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors",
            isLast && answeredCount === 0
              ? "bg-zinc-200 text-zinc-400"
              : "bg-zinc-900 text-zinc-50 hover:bg-zinc-700",
          )}
        >
          {isLast ? (
            <>
              <Check className="size-3" />
              submit
            </>
          ) : isAnswered(toAnswer(q)) ? (
            "next"
          ) : (
            "skip"
          )}
        </button>
      </div>
    </div>
  );
}
