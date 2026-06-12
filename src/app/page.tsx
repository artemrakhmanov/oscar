"use client";

import { useState } from "react";
import { Composer } from "@/components/composer";
import { Drawer } from "@/components/drawer";
import {
  ObservabilitySheet,
  ObservabilityToggle,
} from "@/components/observability-sheet";
import { Transcript } from "@/components/transcript";
import { ObservabilityProvider } from "@/lib/observability/context";
import { INITIAL_EVENTS } from "@/lib/observability/mock-events";
import {
  INITIAL_TRANSCRIPT,
  type TranscriptMessage,
} from "@/lib/mock-data";

export default function Home() {
  const [messages, setMessages] =
    useState<TranscriptMessage[]>(INITIAL_TRANSCRIPT);

  const handleSend = (text: string) => {
    setMessages((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", content: text },
    ]);
  };

  return (
    <ObservabilityProvider initialEvents={INITIAL_EVENTS}>
      <div className="flex h-dvh w-screen overflow-hidden bg-zinc-50">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="absolute top-4 right-4 z-40">
            <ObservabilityToggle />
          </div>
          <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col px-4">
            <Transcript messages={messages} />
            <Drawer />
            <Composer onSend={handleSend} />
          </div>
        </main>
        <ObservabilitySheet />
      </div>
    </ObservabilityProvider>
  );
}
