"use client";

import { differenceInCalendarDays } from "date-fns";
import { ChevronRight } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import useSWR from "swr";

import TrialPopoverContent from "@/components/project/sidebar/trial-popover-content.tsx";
import { useTrialIntro } from "@/components/project/sidebar/use-trial-intro.ts";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { SidebarMenuItem } from "@/components/ui/sidebar.tsx";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

const subscribeNone = () => () => {};

const daysLeftLabel = (daysLeft: number) => {
  if (daysLeft <= 0) return "Ends today";
  if (daysLeft === 1) return "Ends tomorrow";
  return `${daysLeft} days left`;
};

interface TrialCardProps {
  workspaceId: string;
  trialEndsAt: string;
}

export default function TrialCard({ workspaceId, trialEndsAt }: TrialCardProps) {
  const { data } = useSWR<{ convertsToPaid: boolean | null }>(
    `/api/workspaces/${workspaceId}/subscription/trial`,
    swrFetcher
  );
  const convertsToPaid = data?.convertsToPaid === true;
  const { intro, dismissIntro } = useTrialIntro(workspaceId);
  const [open, setOpen] = useState(intro);
  // Calendar days need the viewer's timezone, which the server render doesn't have.
  const hydrated = useSyncExternalStore(
    subscribeNone,
    () => true,
    () => false
  );
  if (!hydrated) return null;

  const endsAt = new Date(trialEndsAt);
  const daysLeft = differenceInCalendarDays(endsAt, new Date());
  const urgent = daysLeft <= 3;

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) track("billing", "trial_sidebar_card_opened");
    else if (intro) dismissIntro();
  };

  return (
    <SidebarMenuItem>
      <Popover open={open} onOpenChange={handleOpenChange}>
        <PopoverTrigger asChild>
          <button
            className={cn(
              "group flex w-full items-center gap-1 rounded-lg p-2 text-left text-xs transition-colors",
              urgent ? "bg-primary/10 hover:bg-primary/15" : "bg-surface-200 hover:bg-surface-300"
            )}
          >
            <span className={cn("flex-1", urgent ? "text-foreground" : "text-muted-foreground")}>Starter trial</span>
            <span className="font-medium text-primary-300">{daysLeftLabel(daysLeft)}</span>
            <ChevronRight className="size-3.5 text-primary-300 transition-transform group-hover:translate-x-0.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent side="right" align="end" className="w-80 text-sm">
          <TrialPopoverContent
            endsAt={endsAt}
            convertsToPaid={convertsToPaid}
            onNavigate={() => handleOpenChange(false)}
          />
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
}
