"use client";

import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useFormContext } from "react-hook-form";

import StepShell from "@/components/onboarding/step-shell";
import { type OnboardingFormValues } from "@/components/onboarding/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_ONBOARDING_INVITES } from "@/lib/actions/onboarding/types";
import { track } from "@/lib/posthog";

interface InviteStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

// Only queues addresses; the invites go out when a trial or paid plan starts at the plan step.
export default function InviteStep({ stepIndex, totalSteps, onAdvance }: InviteStepProps) {
  const { watch, setValue, getValues } = useFormContext<OnboardingFormValues>();
  const [draft, setDraft] = useState("");
  const emails = watch("invites");

  const draftEmail = draft.trim().toLowerCase();
  const canAdd = isEmail(draftEmail) && !emails.includes(draftEmail) && emails.length < MAX_ONBOARDING_INVITES;

  const addDraft = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canAdd) return;
    setValue("invites", [...getValues("invites"), draftEmail]);
    setDraft("");
  };

  const handleNext = () => {
    // A typed but not yet added address still counts.
    if (canAdd) addDraft();
    track("onboarding", "invites_queued", { count: getValues("invites").length });
    onAdvance();
  };

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Invite your team"
      description="Add teammates to your workspace. You can also invite them later from workspace settings."
      onNext={handleNext}
      nextLabel={emails.length > 0 || canAdd ? "Continue" : "Skip for now"}
    >
      <form onSubmit={addDraft} className="flex gap-2">
        <Input
          type="email"
          placeholder="teammate@company.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          autoFocus
        />
        <Button type="submit" variant="outline" disabled={!canAdd}>
          <Plus className="size-4 mr-1" />
          Add
        </Button>
      </form>
      {emails.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {emails.map((email) => (
            <li
              key={email}
              className="flex items-center justify-between rounded-md bg-surface-250 px-3 py-2 text-sm text-secondary-foreground"
            >
              {email}
              <button
                type="button"
                aria-label={`Remove ${email}`}
                onClick={() =>
                  setValue(
                    "invites",
                    getValues("invites").filter((e) => e !== email)
                  )
                }
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}
