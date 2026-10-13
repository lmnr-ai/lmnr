"use client";

import { ArrowRight, Lock } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { useProjectContext } from "@/contexts/project-context";
import { Feature } from "@/lib/features/features";

// Free has no Signals: existing ones stay readable but are paused, so say why on the Signals pages.
export default function FreePlanSignalsBanner() {
  const pathname = usePathname();
  const flags = useFeatureFlags();
  const { project, settingsHref } = useProjectContext();

  if (!flags[Feature.SUBSCRIPTION] || !project?.isFreeTier || !pathname.includes("/signals")) return null;

  return (
    <Link
      href={settingsHref("billing")}
      className="flex items-center gap-3 w-full px-4 py-2 bg-yellow-900/10 hover:bg-yellow-900/30 transition-colors"
    >
      <Lock className="flex-shrink-0 text-yellow-400" size={14} />
      <div className="flex-1 flex items-center justify-between gap-4">
        <span className="text-xs text-foreground/90">
          Signals, Slack alerts and clustering aren&apos;t included in the Free plan. Existing signals are paused.
        </span>
        <div className="flex items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors">
          <span>Upgrade</span>
          <ArrowRight size={14} />
        </div>
      </div>
    </Link>
  );
}
