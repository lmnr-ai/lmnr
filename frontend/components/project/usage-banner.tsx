"use client";

import { AlertCircle, ArrowRight } from "lucide-react";
import Link from "next/link";

import { ProjectDetails } from "@/lib/actions/project";

export default function ProjectUsageBanner({
  details: { workspaceId, gbUsedThisMonth, gbLimit },
}: {
  details: ProjectDetails;
}) {
  const dataPercentage = gbLimit > 0 ? (gbUsedThisMonth / gbLimit) * 100 : 0;

  const messageContent =
    gbLimit > 0
      ? `You've used ${dataPercentage.toFixed(1)}% of your data usage limit. Upgrade your workspace for an uninterrupted experience.`
      : "Review your workspace settings for usage details.";

  return (
    <Link
      href={`/workspace/${workspaceId}`}
      className="flex items-center gap-3 w-full px-4 py-2 bg-yellow-900/10 hover:bg-yellow-900/30 transition-colors"
    >
      <AlertCircle className="flex-shrink-0 text-yellow-400" size={16} />
      <div className="flex-1 flex items-center justify-between gap-4">
        <span className="text-xs text-foreground/90">{messageContent}</span>
        <div className="flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors">
          <span>Manage workspace</span>
          <ArrowRight size={14} />
        </div>
      </div>
    </Link>
  );
}
