"use client";

import { useState } from "react";
import { Bsod } from "@/components/bsod";
import { Composer } from "@/components/composer";
import { Drawer } from "@/components/drawer";
import { Transcript } from "@/components/transcript";
import { useObservability } from "@/lib/observability/context";
import { useOscar } from "@/hooks/use-oscar";
import { appendClarifications } from "@/lib/oscar/clarify";
import { INITIAL_TRANSCRIPT, type TranscriptMessage } from "@/lib/mock-data";

/**
 * The mock agent workspace: transcript + OSCAR drawer + composer, with the
 * OSCAR harness streaming every keystroke and the observability panel
 * narrating each step it takes.
 */
export function Workspace() {
  const { pushEvent, clear } = useObservability();
  const [messages, setMessages] =
    useState<TranscriptMessage[]>(INITIAL_TRANSCRIPT);
  const [crashed, setCrashed] = useState(false);

  const { snapshot, onTextChange, reset } = useOscar(pushEvent);
  const [text, setText] = useState("");

  const handleTextChange = (next: string, opts?: { isPaste?: boolean }) => {
    setText(next);
    onTextChange(next, opts);
  };

  /** Committed clarifications land in the composer as a paste — the gate
   *  fires immediately and the points that raised them dissolve. */
  const handleAppend = (block: string) => {
    handleTextChange(appendClarifications(text, block), { isPaste: true });
    pushEvent({
      kind: "system",
      source: "clarify",
      label: "clarifications committed",
      detail: block.split("\n").slice(1).join(" · "),
    });
  };

  const handleSend = (sent: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: sent },
    ]);
    setCrashed(true);
  };

  /** Returning from the crash resets the whole app to a clean slate. */
  const handleRestart = () => {
    setCrashed(false);
    setMessages([]);
    setText("");
    reset();
    clear();
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4">
      <Transcript messages={messages} />
      <Drawer snapshot={snapshot} promptText={text} onAppend={handleAppend} />
      <Composer value={text} onValueChange={handleTextChange} onSend={handleSend} />
      {crashed ? <Bsod onRestart={handleRestart} /> : null}
    </div>
  );
}
