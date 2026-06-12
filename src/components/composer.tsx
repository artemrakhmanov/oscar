"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, FolderGit2, GitBranch } from "lucide-react";
import { MiniSelect } from "@/components/custom/mini-select";
import { Notch, type NotchItem } from "@/components/custom/notch";
import { Button } from "@/components/ui/button";
import { useObservability } from "@/lib/observability/context";
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

export function Composer({
  value,
  onValueChange,
  onSend,
}: {
  /** Controlled text — the workspace owns it so OSCAR can append to it. */
  value: string;
  /** Fires on every keystroke (and paste) — feeds the OSCAR harness. */
  onValueChange: (text: string, opts?: { isPaste?: boolean }) => void;
  onSend: (text: string) => void;
}) {
  const { pushEvent } = useObservability();
  const text = value;
  const pasteRef = useRef(false);

  const updateText = (next: string) => {
    onValueChange(next, { isPaste: pasteRef.current });
    pasteRef.current = false;
  };

  const [model, setModel] = useState<string>("gpt-5.1-codex");
  const [mode, setMode] = useState<string>("code");
  const [effort, setEffort] = useState<string>("medium");

  const [repoId, setRepoId] = useState<string>(REPOS[0].id);
  const [branch, setBranch] = useState<string>(REPOS[0].defaultBranch);
  const [gitOpen, setGitOpen] = useState<GitSelectId | null>(null);

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
    updateText("");
    pushEvent({
      kind: "system",
      source: "composer",
      label: "prompt dispatched",
      detail: `${model} · mode=${mode} · thinking=${effort} · ${repo.label}@${branch}`,
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
          onChange={(e) => updateText(e.target.value)}
          onPaste={() => {
            pasteRef.current = true;
          }}
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
      <div className="mx-4 flex h-8 items-center justify-between rounded-b-lg border border-t-0 border-zinc-200/80 bg-zinc-100/90 px-1.5">
        <div className="flex items-center gap-0.5">
          <MiniSelect
            icon={<FolderGit2 />}
            display={repo.label}
            value={repoId}
            options={REPOS.map((r) => ({ id: r.id, label: r.label }))}
            open={gitOpen === "repo"}
            onOpenChange={(open) => setGitOpen(open ? "repo" : null)}
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
            icon={<GitBranch />}
            display={branch}
            value={branch}
            options={repo.branches.map((b) => ({ id: b, label: b }))}
            open={gitOpen === "branch"}
            onOpenChange={(open) => setGitOpen(open ? "branch" : null)}
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
