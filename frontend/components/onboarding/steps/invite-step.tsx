"use client";

import { Plus, X } from "lucide-react";
import { type FormEvent, useState } from "react";

import StepShell from "@/components/onboarding/step-shell";
import { useOnboardingActions } from "@/components/onboarding/use-onboarding-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface InviteStepProps {
  stepIndex: number;
  totalSteps: number;
  onAdvance: () => void;
}

const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export default function InviteStep({ stepIndex, totalSteps, onAdvance }: InviteStepProps) {
  const { isSubmitting, saveInvite } = useOnboardingActions();
  const [draft, setDraft] = useState("");
  const [emails, setEmails] = useState<string[]>([]);

  const draftEmail = draft.trim().toLowerCase();
  const canAdd = isEmail(draftEmail) && !emails.includes(draftEmail);

  const addDraft = (e?: FormEvent) => {
    e?.preventDefault();
    if (!canAdd) return;
    setEmails((prev) => [...prev, draftEmail]);
    setDraft("");
  };

  const handleNext = async () => {
    // A typed but not yet added address still counts.
    const toInvite = canAdd ? [...emails, draftEmail] : emails;
    if (await saveInvite(toInvite)) onAdvance();
  };

  const pendingCount = emails.length + (canAdd ? 1 : 0);

  return (
    <StepShell
      stepIndex={stepIndex}
      totalSteps={totalSteps}
      title="Invite your team"
      description="Your plan includes unlimited seats. Teammates get an email invite to join this workspace."
      onNext={handleNext}
      nextLabel={pendingCount > 0 ? `Send ${pendingCount === 1 ? "invite" : "invites"} & continue` : "Skip for now"}
      isSubmitting={isSubmitting}
    >
      <form onSubmit={addDraft} className="flex gap-2">
        <Input
          type="email"
          placeholder="teammate@company.com"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={isSubmitting}
          autoFocus
        />
        <Button type="submit" variant="outline" disabled={!canAdd || isSubmitting}>
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
                onClick={() => setEmails((prev) => prev.filter((e) => e !== email))}
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
