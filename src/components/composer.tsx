"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUp,
  ChevronDown,
  FolderGit2,
  GitBranch,
} from "lucide-react";
import { Notch, type NotchItem } from "@/components/custom/notch";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useObservability } from "@/lib/observability/context";
import { replayMockRun } from "@/lib/observability/mock-events";
import {
  EFFORT_OPTIONS,
  MODEL_OPTIONS,
  MODE_OPTIONS,
  REPOS,
} from "@/lib/mock-data";

const SPRING = { type: "spring" as const, stiffness: 380, damping: 34 };

/** Accent used for selected options. */
const ACCENT = "#3b82f6";

type GitSelectId = "repo" | "branch";

function MiniSelect({
  id,
  icon,
  value,
  options,
  openId,
  onOpen,
  onSelect,
}: {
  id: GitSelectId;
  icon: React.ReactNode;
  value: string;
  options: { id: string; label: string }[];
  openId: GitSelectId | null;
  onOpen: (id: GitSelectId | null) => void;
  onSelect: (optionId: string) => void;
}) {
  const open = openId === id;
  return (
    <div className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => onOpen(open ? null : id)}
        className={cn(
          "flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[10px] transition-colors",
          open
            ? "bg-zinc-200/80 text-zinc-800"
            : "text-zinc-500 hover:bg-zinc-200/60 hover:text-zinc-800",
        )}
      >
        <span className="opacity-70 [&_svg]:size-2.5">{icon}</span>
        <span>{value}</span>
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
            initial={{ opacity: 0, y: 4, filter: "blur(3px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            exit={{ opacity: 0, y: 4, filter: "blur(3px)" }}
            transition={{ type: "spring", stiffness: 420, damping: 30 }}
            className="absolute bottom-full left-0 z-50 mb-1.5 w-max min-w-32 overflow-hidden rounded-lg border border-zinc-200 bg-white py-1 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.25)]"
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
                        className="size-1 rounded-full"
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

export function Composer({ onSend }: { onSend: (text: string) => void }) {
  const { pushEvent } = useObservability();
  const [text, setText] = useState("");

  const [model, setModel] = useState<string>("gpt-5.1-codex");
  const [mode, setMode] = useState<string>("code");
  const [effort, setEffort] = useState<string>("medium");

  const [repoId, setRepoId] = useState<string>(REPOS[0].id);
  const [branch, setBranch] = useState<string>(REPOS[0].defaultBranch);
  const [gitOpen, setGitOpen] = useState<GitSelectId | null>(null);
  const gitRowRef = useRef<HTMLDivElement>(null);

  const cancelRunRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cancelRunRef.current?.(), []);

  useEffect(() => {
    if (!gitOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!gitRowRef.current?.contains(e.target as Node)) setGitOpen(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setGitOpen(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [gitOpen]);

  const repo = REPOS.find((r) => r.id === repoId) ?? REPOS[0];

  const paramItems: NotchItem[] = [
    {
      id: "model",
      label: "Model",
      value: model,
      onChange: (id) => setModel(id),
      options: MODEL_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    },
    {
      id: "mode",
      label: "Mode",
      value: mode,
      onChange: (id) => setMode(id),
      options: MODE_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    },
    {
      id: "effort",
      label: "Thinking",
      value: effort,
      onChange: (id) => setEffort(id),
      options: EFFORT_OPTIONS.map((o) => ({ id: o.id, label: o.label })),
    },
  ];

  const send = () => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
    pushEvent({
      kind: "system",
      source: "composer",
      label: "prompt dispatched",
      detail: `${model} · mode=${mode} · thinking=${effort} · ${repo.label}@${branch}`,
    });
    cancelRunRef.current?.();
    cancelRunRef.current = replayMockRun(pushEvent, {
      model,
      mode,
      repo: repo.label,
      branch,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 28, filter: "blur(6px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ ...SPRING, delay: 0.1 }}
      className="pb-4"
    >
      <div className="relative z-10 rounded-2xl border border-zinc-200 bg-white shadow-[0_8px_30px_-12px_rgba(0,0,0,0.12)]">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          placeholder="Describe what you want the agent to do…"
          rows={3}
          className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm leading-relaxed text-zinc-800 outline-none placeholder:text-zinc-400"
        />

        <div className="flex items-end justify-between gap-3 px-2.5 pb-2.5">
          {/* Height-reserving anchor: the open panel grows upward over the textarea. */}
          <div className="relative h-8 flex-1">
            <div className="absolute bottom-0 left-0">
              <Notch
                floating={false}
                items={paramItems}
                accentColor={ACCENT}
                reveal={false}
              />
            </div>
          </div>
          <motion.div whileTap={{ scale: 0.92 }} whileHover={{ scale: 1.05 }}>
            <Button
              size="icon"
              onClick={send}
              disabled={!text.trim()}
              aria-label="Send prompt"
              className="size-9 rounded-full bg-zinc-900 text-zinc-50 hover:bg-zinc-700 disabled:opacity-30"
            >
              <ArrowUp className="size-4" />
            </Button>
          </motion.div>
        </div>
      </div>

      {/* Thin under-card extending from beneath the composer. */}
      <div className="mx-4 flex items-center justify-between rounded-b-lg border border-t-0 border-zinc-200/80 bg-zinc-100/90 px-1.5 py-0.5">
        <div ref={gitRowRef} className="flex items-center gap-0.5">
          <MiniSelect
            id="repo"
            icon={<FolderGit2 />}
            value={repo.label}
            options={REPOS.map((r) => ({ id: r.id, label: r.label }))}
            openId={gitOpen}
            onOpen={setGitOpen}
            onSelect={(id) => {
              const next = REPOS.find((r) => r.id === id);
              if (!next) return;
              setRepoId(next.id);
              setBranch(next.defaultBranch);
              // Pop the branch picker open right after a repo is chosen.
              setGitOpen("branch");
            }}
          />
          <span className="font-mono text-[10px] text-zinc-300">:</span>
          <MiniSelect
            id="branch"
            icon={<GitBranch />}
            value={branch}
            options={repo.branches.map((b) => ({ id: b, label: b }))}
            openId={gitOpen}
            onOpen={setGitOpen}
            onSelect={(id) => {
              setBranch(id);
              setGitOpen(null);
            }}
          />
        </div>
        <span className="pr-1 font-mono text-[9px] tracking-wide text-zinc-400">
          ⏎ send · ⇧⏎ newline
        </span>
      </div>
    </motion.div>
  );
}
