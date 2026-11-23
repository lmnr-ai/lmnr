"use client";

import Announcements from "@/components/announcements";
import { useAnnouncementDials } from "@/components/announcements/use-announcement-dials";
import TrialCard from "@/components/project/sidebar/trial-card.tsx";
import UsageCard from "@/components/project/sidebar/usage-card.tsx";
import { useUsageDials } from "@/components/project/use-usage-dials";
import { SidebarGroup, SidebarGroupContent, SidebarMenu, useSidebar } from "@/components/ui/sidebar.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type ProjectDetails } from "@/lib/actions/project";
import { type Announcement } from "@/lib/announcements/types";
import { Feature } from "@/lib/features/features";
import { cn } from "@/lib/utils";

interface SidebarBottomCardsProps {
  announcements: Announcement[];
  details: ProjectDetails;
  dismissedAnnouncementIds: string[];
}

/** Trial, usage, and the feature carousel, pinned below the scrolling nav. */
export default function SidebarBottomCards({
  announcements,
  details,
  dismissedAnnouncementIds,
}: SidebarBottomCardsProps) {
  const featureFlags = useFeatureFlags();
  const { open, openMobile } = useSidebar();
  const usageDials = useUsageDials(details);
  const shownAnnouncements = useAnnouncementDials(announcements);

  const showUsage = usageDials ? usageDials.show : featureFlags[Feature.SUBSCRIPTION] && details.isFreeTier;
  const showTrial = featureFlags[Feature.SUBSCRIPTION] && !!details.trialEndsAt;
  const showOpenSource = !!featureFlags[Feature.LAMINAR_CLOUD];
  const showCarousel = showOpenSource || shownAnnouncements.length > 0;

  if (!showUsage && !showTrial && !showCarousel) return null;

  return (
    <SidebarGroup className={cn("shrink-0 px-2 pt-0 pb-1 md:pb-7", !(open || openMobile) && "hidden")}>
      <SidebarGroupContent>
        <SidebarMenu className="gap-[6px]">
          {showTrial && <TrialCard workspaceId={details.workspaceId} trialEndsAt={details.trialEndsAt!} />}
          {showUsage && <UsageCard usageDetails={usageDials?.details ?? details} />}
          {showCarousel && (
            <Announcements
              announcements={shownAnnouncements}
              initialDismissedIds={dismissedAnnouncementIds}
              showOpenSource={showOpenSource}
            />
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
