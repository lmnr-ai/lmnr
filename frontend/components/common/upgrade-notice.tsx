"use client";

import { ArrowUpRight, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { useProjectContext } from "@/contexts/project-context";
import { TRIAL_DAYS } from "@/lib/actions/checkout/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";

interface UpgradeNoticeProps {
  title: string;
  description: string;
  source: string;
  actions?: ReactNode;
}

export default function UpgradeNotice({ title, description, source, actions }: UpgradeNoticeProps) {
  const { project, settingsHref } = useProjectContext();
  const router = useRouter();
  const { toast } = useToast();
  const [isStarting, setIsStarting] = useState(false);
  const workspaceId = project?.workspaceId;
  const { data } = useSWR<{ eligible: boolean }>(
    workspaceId ? `/api/workspaces/${workspaceId}/subscription/trial/eligibility` : null,
    swrFetcher
  );

  const startTrial = async () => {
    track("billing", "upgrade_clicked", { source, trial: true });
    setIsStarting(true);
    try {
      const res = await fetch(`/api/workspaces/${workspaceId}/subscription/trial`, { method: "POST" });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to start the free trial");
      }
      router.refresh();
    } catch (e) {
      toast({ variant: "destructive", title: e instanceof Error ? e.message : "Failed to start the free trial" });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-secondary p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        {data?.eligible ? (
          <Button onClick={startTrial} disabled={isStarting}>
            {isStarting && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
            Start {TRIAL_DAYS}-day free trial
          </Button>
        ) : (
          <Link href={settingsHref("billing")} onClick={() => track("billing", "upgrade_clicked", { source })}>
            <Button>
              Upgrade to Starter
              <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
        )}
      </div>
    </div>
  );
}
