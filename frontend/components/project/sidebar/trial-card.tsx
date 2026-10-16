"use client";

import { differenceInCalendarDays, format } from "date-fns";
import { ArrowUpRight, Check, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button.tsx";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { SidebarMenuItem } from "@/components/ui/sidebar.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { TIER_RETENTION } from "@/lib/billing/retention";
import { TIERS } from "@/lib/billing/tiers";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

const KEPT_ON_STARTER = [
  `${TIERS.hobby.includedBytesGB} GB of data a month (Free has ${TIERS.free.includedBytesGB} GB)`,
  `${TIER_RETENTION.hobby.durationPlural} of data access (Free has ${TIER_RETENTION.free.durationPlural})`,
  "Signals and clusters",
  "Slack notifications",
  "Unlimited projects and teammates",
];

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
  const { settingsHref } = useProjectContext();
  const { data } = useSWR<{ convertsToPaid: boolean | null }>(
    `/api/workspaces/${workspaceId}/subscription/trial`,
    swrFetcher
  );
  const convertsToPaid = data?.convertsToPaid === true;
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

  return (
    <SidebarMenuItem>
      <Popover onOpenChange={(open) => open && track("billing", "trial_sidebar_card_opened")}>
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
        <PopoverContent side="right" align="end" className="flex w-80 flex-col gap-3 text-sm">
          <span className="font-medium">Your Starter trial ends on {format(endsAt, "MMMM d")}</span>
          {convertsToPaid ? (
            <span className="text-secondary-foreground">
              Starter starts then at ${TIERS.hobby.basePriceMonthly}/month on your saved card.
            </span>
          ) : (
            <>
              <span className="text-secondary-foreground">
                After that, this workspace moves to the Free plan. Upgrade to Starter to keep:
              </span>
              <ul className="flex flex-col gap-1.5 text-xs">
                {KEPT_ON_STARTER.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-primary" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <Link href={settingsHref("billing")}>
            <Button className="w-full" variant={convertsToPaid ? "outline" : "default"}>
              <span>{convertsToPaid ? "Manage billing" : "Upgrade"}</span>
              <ArrowUpRight className="ml-1 size-3.5" />
            </Button>
          </Link>
        </PopoverContent>
      </Popover>
    </SidebarMenuItem>
  );
}
