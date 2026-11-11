"use client";

import { Plus, Radio } from "lucide-react";

import { useCreateSignalSheet } from "@/components/signals/create-signal-sheet/store";
import SignalsFreePlanPlaceholder from "@/components/signals/free-plan-placeholder";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";

/** /signals with no signal to open: the free-plan pitch, or a prompt to create the first one. */
export default function NoSignals() {
  const { project } = useProjectContext();
  const featureFlags = useFeatureFlags();
  const openCreate = useCreateSignalSheet((state) => state.setOpen);

  if (featureFlags[Feature.SUBSCRIPTION] && project?.isFreeTier) return <SignalsFreePlanPlaceholder />;

  return (
    <>
      <Header path="signals" />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <Radio className="size-8 text-muted-foreground" />
        <span className="text-sm font-medium">No signals yet</span>
        <span className="max-w-xs text-xs text-muted-foreground">
          Describe what to look for in your traces, and Signals find it on every new trace.
        </span>
        <Button className="gap-1.5" onClick={() => openCreate(true)}>
          <Plus className="size-3.5" />
          Create signal
        </Button>
      </div>
    </>
  );
}
