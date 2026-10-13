"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { TRIAL_DAYS } from "@/lib/actions/checkout/types";
import { track } from "@/lib/posthog";

interface StartTrialButtonProps {
  workspaceId: string;
  onError: (error: string) => void;
}

export default function StartTrialButton({ workspaceId, onError }: StartTrialButtonProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleStart = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/subscription/trial`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to start the free trial");
      }
      track("billing", "trial_started");
      router.refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to start the free trial");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button className="w-full h-8 text-xs" onClick={handleStart} disabled={isLoading}>
      {isLoading && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
      Start {TRIAL_DAYS}-day free trial
    </Button>
  );
}
