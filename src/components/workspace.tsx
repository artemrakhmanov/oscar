"use client";

import { useState } from "react";
import { Composer } from "@/components/composer";
import { Drawer } from "@/components/drawer";
import { Transcript } from "@/components/transcript";
import { useObservability } from "@/lib/observability/context";
import { useOscar } from "@/hooks/use-oscar";
import { INITIAL_TRANSCRIPT, type TranscriptMessage } from "@/lib/mock-data";

/**
 * The mock agent workspace: transcript + OSCAR drawer + composer, with the
 * OSCAR harness streaming every keystroke and the observability panel
 * narrating each step it takes.
 */
export function Workspace() {
  const { pushEvent } = useObservability();
  const [messages, setMessages] =
    useState<TranscriptMessage[]>(INITIAL_TRANSCRIPT);

  const { snapshot, onTextChange, reset } = useOscar(pushEvent);

  const handleSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
    reset();
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4">
      <Transcript messages={messages} />
      <Drawer snapshot={snapshot} />
      <Composer onSend={handleSend} onTextChange={onTextChange} />
    </div>
  );
}
