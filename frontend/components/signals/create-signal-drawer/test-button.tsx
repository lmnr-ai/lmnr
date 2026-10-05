"use client";

import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";

import TestDialog from "./test-panel/test-dialog";
import { type ManageSignalForm } from "./types";

export default function TestButton() {
  const featureFlags = useFeatureFlags();
  const { watch } = useFormContext<ManageSignalForm>();
  const [open, setOpen] = useState(false);

  const [schemaFields, prompt, llmProfileId, llmModel] = watch(["schemaFields", "prompt", "llmProfileId", "llmModel"]);
  // Self-hosted signals can't be saved without a profile, so a test on env credentials would be misleading.
  const missingProfile = featureFlags[Feature.SIGNAL_LLM_PROFILES] && !(llmProfileId && llmModel);

  const disabledReason = !prompt
    ? "Add a prompt first"
    : !schemaFields?.some((f) => f.name.trim())
      ? "Add at least one output field first"
      : missingProfile
        ? "Select an LLM profile and model first"
        : null;

  const button = (
    <Button
      type="button"
      variant="outline"
      size="md"
      className="gap-2"
      onClick={() => setOpen(true)}
      disabled={Boolean(disabledReason)}
    >
      <PlayIcon className="w-3.5 h-3.5" />
      Test
    </Button>
  );

  return (
    <>
      {disabledReason ? (
        <TooltipProvider delayDuration={200}>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="cursor-not-allowed">{button}</span>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-60">
              <p>{disabledReason}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        button
      )}
      <TestDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
