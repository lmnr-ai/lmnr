"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button.tsx";
import { Progress } from "@/components/ui/progress.tsx";
import { SidebarMenuItem } from "@/components/ui/sidebar.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { type ProjectDetails } from "@/lib/actions/project";

interface UsageCardProps {
  usageDetails: ProjectDetails;
}

export default function UsageCard({ usageDetails }: UsageCardProps) {
  const { settingsHref } = useProjectContext();
  const { gbLimit, gbUsedThisMonth, signalCreditGrantedMicroUsd, signalCreditRemainingMicroUsd } = usageDetails;
  const formatGB = (gb: number) => {
    if (gb < 0.001) {
      return `${(gb * 1024).toFixed(0)} MB`;
    }
    return `${gb.toFixed(1)} GB`;
  };

  // Signal usage/limit are micro-USD (1e-6 USD); render as a dollar amount.
  const formatSignalCost = (microUsd: number) =>
    `$${(microUsd / 1_000_000).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const storagePercentage = gbLimit > 0 ? Math.min((gbUsedThisMonth / gbLimit) * 100, 100) : 0;
  const signalCreditUsedMicroUsd = Math.max(0, signalCreditGrantedMicroUsd - signalCreditRemainingMicroUsd);
  const signalCreditUsedPercentage =
    signalCreditGrantedMicroUsd > 0
      ? Math.min((signalCreditUsedMicroUsd / signalCreditGrantedMicroUsd) * 100, 100)
      : 100;

  return (
    <SidebarMenuItem>
      <div className="flex flex-col gap-3 rounded-lg bg-surface-200 p-2 text-xs">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">Data</span>
            <span className="font-medium text-secondary-foreground">
              <span className="font-semibold">{formatGB(gbUsedThisMonth)}</span> / {formatGB(gbLimit)}
            </span>
          </div>
          <Progress
            value={storagePercentage}
            className="mx-0.5 h-1 w-[calc(100%-4px)] border-0 bg-[#2f2f32]"
            indicatorClassName="bg-primary-400"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1 text-muted-foreground">Signals</span>
            <span className="font-medium text-secondary-foreground">
              {signalCreditGrantedMicroUsd > 0 ? (
                <>
                  <span className="font-semibold">{formatSignalCost(signalCreditUsedMicroUsd)}</span> /{" "}
                  {formatSignalCost(signalCreditGrantedMicroUsd)}
                </>
              ) : (
                "No credit available"
              )}
            </span>
          </div>
          <Progress
            value={signalCreditUsedPercentage}
            className="mx-0.5 h-1 w-[calc(100%-4px)] border-0 bg-[#2f2f32]"
            indicatorClassName="bg-primary-400"
          />
        </div>

        <Link href={settingsHref("billing")}>
          <Button className="w-full">
            <span>Upgrade</span>
            <ArrowUpRight className="ml-1 size-3.5" />
          </Button>
        </Link>
      </div>
    </SidebarMenuItem>
  );
}
