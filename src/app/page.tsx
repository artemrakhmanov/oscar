"use client";

import {
  ObservabilitySheet,
  ObservabilityToggle,
} from "@/components/observability-sheet";
import { Workspace } from "@/components/workspace";
import { ObservabilityProvider } from "@/lib/observability/context";

export default function Home() {
  return (
    <ObservabilityProvider>
      <div className="flex h-dvh w-screen overflow-hidden bg-zinc-50">
        <main className="relative flex min-w-0 flex-1 flex-col">
          <div className="absolute top-4 right-4 z-40">
            <ObservabilityToggle />
          </div>
          <Workspace />
        </main>
        <ObservabilitySheet />
      </div>
    </ObservabilityProvider>
  );
}
