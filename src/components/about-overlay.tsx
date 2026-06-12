"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring" as const, stiffness: 320, damping: 32 };

const SANS = { fontFamily: "var(--font-geist-sans), system-ui, sans-serif" };
const MONO = { fontFamily: "var(--font-geist-mono), monospace" };

// ---------------------------------------------------------------------------
// The scripted engine run — a real OSCAR session, compressed to ~10 seconds.
// Events fire as the typewriter passes their character index.
// ---------------------------------------------------------------------------

const DEMO_PROMPT =
  "Refactor the auth module to use the new session store, but keep the public API surface identical. Actually — drop Redis, use Postgres instead.";

const after = (s: string) => DEMO_PROMPT.indexOf(s) + s.length;

type Sev = "low" | "mid" | "high";
type LedgerOp =
  | { kind: "add"; id: string; letter: "O" | "S" | "C" | "A" | "R"; text: string; sev: Sev }
  | { kind: "revise"; id: string; text: string; sev: Sev }
  | { kind: "remove"; id: string };

type EngineEvent =
  | { at: number; stage: "gate"; note: string; alarm?: boolean }
  | { at: number; stage: "scout"; note: string }
  | { at: number; stage: "analyze"; note: string }
  | { at: number; stage: "op"; op: LedgerOp };

const EVENTS: EngineEvent[] = [
  { at: after("auth module "), stage: "gate", note: "word burst · 6 words" },
  { at: after("auth module "), stage: "scout", note: "mid-thought, dangling clause — wait" },
  { at: after("session store,"), stage: "gate", note: "clause boundary" },
  { at: after("session store,") + 1, stage: "scout", note: "objective landed → incremental" },
  { at: after("session store,") + 4, stage: "analyze", note: "streaming ops · rev 1" },
  {
    at: after("session store,") + 8,
    stage: "op",
    op: { kind: "add", id: "o1", letter: "O", text: "adopt new session store", sev: "low" },
  },
  {
    at: after("session store,") + 16,
    stage: "op",
    op: { kind: "add", id: "a1", letter: "A", text: "which store? redis vs pg", sev: "high" },
  },
  { at: after("but "), stage: "gate", note: "connective · “but”" },
  { at: after("identical."), stage: "gate", note: "sentence boundary" },
  { at: after("identical.") + 1, stage: "scout", note: "hard constraint → incremental" },
  { at: after("identical.") + 3, stage: "analyze", note: "streaming ops · rev 2" },
  {
    at: after("identical.") + 6,
    stage: "op",
    op: { kind: "add", id: "c1", letter: "C", text: "public API frozen", sev: "mid" },
  },
  {
    at: after("identical.") + 12,
    stage: "op",
    op: { kind: "add", id: "r1", letter: "R", text: "hidden consumers may break", sev: "high" },
  },
  { at: after("Actually —"), stage: "gate", note: "reversal · “actually”", alarm: true },
  { at: after("Actually —") + 2, stage: "scout", note: "contradiction — re-examine o1, a1" },
  { at: after("Postgres instead."), stage: "analyze", note: "streaming ops · rev 3" },
  {
    at: after("Postgres instead.") + 2,
    stage: "op",
    op: { kind: "revise", id: "o1", text: "move sessions to postgres", sev: "low" },
  },
  { at: after("Postgres instead.") + 6, stage: "op", op: { kind: "remove", id: "a1" } },
  {
    at: after("Postgres instead.") + 10,
    stage: "op",
    op: { kind: "add", id: "s1", letter: "S", text: "session module + auth imports", sev: "mid" },
  },
];

/** Deliberately slow — this plays on a big screen while someone talks. */
const TICK_MS = 95;

interface LedgerItem {
  id: string;
  letter: "O" | "S" | "C" | "A" | "R";
  text: string;
  sev: Sev;
  removed: boolean;
  revised: boolean;
}

/** Monochrome severity: brightness is the only channel. */
const SEV_DOT: Record<Sev, string> = {
  low: "bg-white/25",
  mid: "bg-white/55",
  high: "bg-white",
};

function useEngine(open: boolean) {
  const [chars, setChars] = useState(0);
  const [items, setItems] = useState<LedgerItem[]>([]);
  const [gateNote, setGateNote] = useState<{ note: string; alarm: boolean } | null>(null);
  const [scoutNote, setScoutNote] = useState<string | null>(null);
  const [analyzeNote, setAnalyzeNote] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [runId, setRunId] = useState(0);
  const fired = useRef(0);

  useEffect(() => {
    if (!open) return;
    let count = 0;
    fired.current = 0;
    setChars(0);
    setItems([]);
    setGateNote(null);
    setScoutNote(null);
    setAnalyzeNote(null);
    setDone(false);

    const interval = window.setInterval(() => {
      count++;
      // Single pass — ends quietly and waits for an explicit replay.
      if (count > DEMO_PROMPT.length && fired.current >= EVENTS.length) {
        window.clearInterval(interval);
        setDone(true);
        return;
      }
      setChars(Math.min(count, DEMO_PROMPT.length));

      while (fired.current < EVENTS.length && EVENTS[fired.current].at <= count) {
        const e = EVENTS[fired.current++];
        setPulse(e.stage + fired.current);
        if (e.stage === "gate") setGateNote({ note: e.note, alarm: e.alarm ?? false });
        if (e.stage === "scout") setScoutNote(e.note);
        if (e.stage === "analyze") setAnalyzeNote(e.note);
        if (e.stage === "op") {
          const op = e.op;
          setItems((prev) => {
            if (op.kind === "add") {
              return [
                ...prev,
                { id: op.id, letter: op.letter, text: op.text, sev: op.sev, removed: false, revised: false },
              ];
            }
            if (op.kind === "revise") {
              return prev.map((i) =>
                i.id === op.id ? { ...i, text: op.text, sev: op.sev, revised: true } : i,
              );
            }
            return prev.map((i) => (i.id === op.id ? { ...i, removed: true } : i));
          });
        }
      }
    }, TICK_MS);
    return () => window.clearInterval(interval);
  }, [open, runId]);

  const replay = () => setRunId((id) => id + 1);

  return { chars, items, gateNote, scoutNote, analyzeNote, pulse, done, replay };
}

// ---------------------------------------------------------------------------
// Pieces
// ---------------------------------------------------------------------------

function StageNode({
  label,
  sub,
  note,
  active,
}: {
  label: string;
  sub: string;
  note: string | null;
  active: boolean;
}) {
  return (
    <div
      className={cn(
        "min-w-0 flex-1 border px-3 py-2.5 transition-colors duration-300",
        active ? "border-white/60" : "border-white/[0.12]",
      )}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span
          style={MONO}
          className={cn(
            "text-[10px] tracking-[0.2em] uppercase transition-colors duration-300",
            active ? "text-white" : "text-white/50",
          )}
        >
          {label}
        </span>
        <span style={MONO} className="hidden truncate text-[9px] text-white/25 lg:block">
          {sub}
        </span>
      </div>
      <div className="mt-1.5 h-3.5 overflow-hidden">
        <AnimatePresence mode="popLayout">
          <motion.p
            key={note ?? "idle"}
            initial={{ y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -10, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={MONO}
            className={cn("truncate text-[10px]", note ? "text-white/70" : "text-white/20")}
          >
            {note ?? "—"}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Connector({ active }: { active: boolean }) {
  return (
    <div className="relative mt-[1.35rem] h-px w-4 shrink-0 self-start bg-white/10 sm:w-7">
      <div
        className="absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(90deg, rgba(255,255,255,0.9) 0 3px, transparent 3px 8px)",
          backgroundSize: "8px 1px",
          animation: "oscar-flow 0.6s linear infinite",
          opacity: active ? 1 : 0,
          transition: "opacity 0.3s",
        }}
      />
    </div>
  );
}

const COLUMNS: { letter: "O" | "S" | "C" | "A" | "R"; name: string }[] = [
  { letter: "O", name: "objectives" },
  { letter: "S", name: "scope" },
  { letter: "C", name: "constraints" },
  { letter: "A", name: "ambiguities" },
  { letter: "R", name: "risks" },
];

// ---------------------------------------------------------------------------
// The overlay
// ---------------------------------------------------------------------------

export function AboutOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { chars, items, gateNote, scoutNote, analyzeNote, pulse, done, replay } =
    useEngine(open);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const typed = DEMO_PROMPT.slice(0, chars);
  const gateActive = pulse?.startsWith("gate") ?? false;
  const scoutActive = pulse?.startsWith("scout") ?? false;
  const analyzeActive = (pulse?.startsWith("analyze") || pulse?.startsWith("op")) ?? false;

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[150] flex flex-col overflow-y-auto bg-black text-white [scrollbar-width:thin]"
          style={SANS}
          role="dialog"
          aria-modal="true"
          aria-label="OSCAR — how the engine works"
        >
          <style>{`
            @keyframes oscar-flow { from { background-position-x: 0; } to { background-position-x: 8px; } }
            @keyframes oscar-blink { 0%, 55% { opacity: 1; } 56%, 100% { opacity: 0; } }
          `}</style>

          <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-6 py-6 sm:px-10">
            {/* Top bar */}
            <motion.header
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { delay: 0.05, duration: 0.4 } }}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <span className="flex size-6 items-center justify-center bg-white text-[11px] font-semibold text-black">
                  O
                </span>
                <span style={MONO} className="text-[11px] text-white/40">
                  oscar · prompt copilot
                </span>
              </div>
              <button
                type="button"
                onClick={onClose}
                style={MONO}
                className="border border-white/15 px-2.5 py-1 text-[10px] text-white/40 transition-colors hover:border-white/40 hover:text-white"
              >
                esc
              </button>
            </motion.header>

            {/* Hero */}
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: 0.12 } }}
              className="mt-12 sm:mt-16"
            >
              <h1 className="max-w-3xl text-[clamp(2rem,5vw,3.75rem)] leading-[1.05] font-medium tracking-tight text-white">
                The prompt copilot.
                <br />
                <span className="text-white/40">It starts working before you hit send.</span>
              </h1>
              <div
                style={MONO}
                className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[11px] tracking-wide"
              >
                {["Objectives", "Scope", "Constraints", "Ambiguities", "Risks"].map(
                  (word) => (
                    <span key={word} className="text-white/35">
                      <span className="text-white">{word[0]}</span>
                      {word.slice(1)}
                    </span>
                  ),
                )}
              </div>
            </motion.div>

            {/* The engine, live */}
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: 0.25 } }}
              className="mt-12"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span style={MONO} className="text-[10px] tracking-[0.2em] text-white/40 uppercase">
                  the engine
                </span>
                {done ? (
                  <button
                    type="button"
                    onClick={replay}
                    style={MONO}
                    className="border border-white/15 px-2.5 py-0.5 text-[10px] text-white/50 transition-colors hover:border-white/40 hover:text-white"
                  >
                    replay
                  </button>
                ) : (
                  <span
                    style={MONO}
                    className="flex items-center gap-1.5 px-2.5 py-0.5 text-[10px] text-white/40"
                  >
                    <span className="size-1 animate-pulse rounded-full bg-white" />
                    running
                  </span>
                )}
              </div>

              {/* Typed prompt */}
              <div
                style={MONO}
                className="mt-5 min-h-[3.6rem] border border-white/[0.12] px-4 py-3 text-[12px] leading-relaxed text-white/80 sm:text-[13px]"
              >
                {typed}
                <span
                  className="ml-px inline-block h-[1.05em] w-[6px] translate-y-[2px] bg-white"
                  style={{ animation: "oscar-blink 1.1s steps(1) infinite" }}
                />
              </div>

              {/* Pipeline */}
              <div className="mt-3 flex items-stretch">
                <StageNode
                  label="gate"
                  sub="pure code · every keystroke"
                  note={gateNote?.note ?? null}
                  active={gateActive}
                />
                <Connector active={gateActive || scoutActive} />
                <StageNode label="scout" sub="nano triage · advises" note={scoutNote} active={scoutActive} />
                <Connector active={scoutActive || analyzeActive} />
                <StageNode
                  label="analyze"
                  sub="streamed operations"
                  note={analyzeNote}
                  active={analyzeActive}
                />
              </div>

              {/* Ledger */}
              <div className="mt-3 grid grid-cols-5 gap-px bg-white/[0.12]">
                {COLUMNS.map((col) => {
                  const colItems = items.filter((i) => i.letter === col.letter);
                  return (
                    <div key={col.letter} className="min-h-[5.5rem] bg-black p-2.5">
                      <div className="flex items-baseline gap-1.5">
                        <span style={MONO} className="text-[12px] font-medium text-white">
                          {col.letter}
                        </span>
                        <span
                          style={MONO}
                          className="hidden truncate text-[9px] text-white/25 sm:block"
                        >
                          {col.name}
                        </span>
                      </div>
                      <div className="mt-2 flex flex-col gap-1.5">
                        <AnimatePresence>
                          {colItems.map((item) => (
                            <motion.div
                              key={item.id}
                              layout
                              initial={{ opacity: 0, y: 6 }}
                              animate={{
                                opacity: item.removed ? 0.25 : 1,
                                y: 0,
                                transition: SPRING,
                              }}
                              className="flex items-start gap-1.5"
                            >
                              <span
                                className={cn(
                                  "mt-[3px] size-1 shrink-0 rounded-full",
                                  SEV_DOT[item.sev],
                                )}
                              />
                              <motion.span
                                key={item.text}
                                style={MONO}
                                initial={item.revised ? { color: "#ffffff" } : false}
                                animate={{
                                  color: item.removed
                                    ? "rgba(255,255,255,0.3)"
                                    : "rgba(255,255,255,0.6)",
                                }}
                                transition={{ duration: 0.9 }}
                                className={cn(
                                  "text-[10px] leading-snug",
                                  item.removed && "line-through",
                                )}
                              >
                                {item.text}
                              </motion.span>
                            </motion.div>
                          ))}
                        </AnimatePresence>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.section>

            {/* Three columns */}
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: 0.38 } }}
              className="mt-14 grid gap-10 pb-10 sm:grid-cols-3 sm:gap-8"
            >
              <div>
                <p style={MONO} className="text-[10px] tracking-[0.2em] text-white/35 uppercase">
                  01 — the contract
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-white/55">
                  Every judgement is anchored to a verbatim quote from your prompt — if it
                  can&apos;t quote it, it can&apos;t claim it. Delete the words and the
                  judgement dies in the same frame, before any model call.
                </p>
              </div>
              <div>
                <p style={MONO} className="text-[10px] tracking-[0.2em] text-white/35 uppercase">
                  02 — the economics
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-white/55">
                  Calls fire on thought boundaries — sentence ends, &ldquo;but&rdquo;,
                  &ldquo;actually&rdquo; — never per keystroke. The model streams edits to a
                  ledger, not fresh analyses: the drawer converges instead of repainting.
                </p>
              </div>
              <div>
                <p style={MONO} className="text-[10px] tracking-[0.2em] text-white/35 uppercase">
                  03 — where this goes
                </p>
                <p className="mt-3 text-[13px] leading-relaxed text-white/55">
                  OSCAR already drafts the research its open questions deserve. Next:
                  prelaunch those agents while you type — by ⏎ the scouts have reported
                  back, and the agent starts with answers. Uninterrupted flow, intent to
                  working code.
                </p>
              </div>
            </motion.section>

            {/* Closing statement */}
            <motion.section
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0, transition: { ...SPRING, delay: 0.5 } }}
              className="mt-auto pt-6 pb-16 sm:pb-24"
            >
              <h2 className="max-w-4xl text-[clamp(1.75rem,4.5vw,3.25rem)] leading-[1.1] font-medium tracking-tight text-white/40">
                Pre-launch research agents
                <br />
                while you&apos;re prompting —{" "}
                <span className="text-white">uninterrupted flow.</span>
              </h2>
            </motion.section>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
