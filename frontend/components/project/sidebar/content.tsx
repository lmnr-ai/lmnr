"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo } from "react";

import Announcements from "@/components/announcements";
import OpenSourceCard from "@/components/project/sidebar/open-source-card.tsx";
import TrialCard from "@/components/project/sidebar/trial-card.tsx";
import UsageCard from "@/components/project/sidebar/usage-card.tsx";
import { getSidebarMenus } from "@/components/project/utils.ts";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type ProjectDetails } from "@/lib/actions/project";
import { type Announcement } from "@/lib/announcements/types";
import { Feature } from "@/lib/features/features";
import { cn } from "@/lib/utils";

interface ProjectSidebarContentProps {
  announcements: Announcement[];
  details: ProjectDetails;
  dismissedAnnouncementIds: string[];
}

const ProjectSidebarContent = ({ announcements, details, dismissedAnnouncementIds }: ProjectSidebarContentProps) => {
  const pathname = usePathname();
  const featureFlags = useFeatureFlags();
  const options = useMemo(
    () =>
      getSidebarMenus(details.id).filter(
        (m) =>
          (m.name !== "signals" || featureFlags[Feature.SIGNALS]) && (m.name !== "home" || featureFlags[Feature.AGENT])
      ),
    [details.id, featureFlags]
  );
  const { open, openMobile } = useSidebar();
  const showUsage = featureFlags[Feature.SUBSCRIPTION] && details.isFreeTier;
  const showTrial = featureFlags[Feature.SUBSCRIPTION] && !!details.trialEndsAt;

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {options.map((option) => (
              <SidebarMenuItem className="h-7" key={option.name}>
                <SidebarMenuButton asChild isActive={pathname.startsWith(option.href)} tooltip={option.name}>
                  <Link href={option.href}>
                    <option.icon />
                    <span>{option.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      {(showUsage || showTrial || featureFlags[Feature.LAMINAR_CLOUD]) && (
        <SidebarGroup className={cn("mt-auto p-1", !(open || openMobile) && "hidden")}>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {/* TEMP: both trial card variants for comparison. */}
              {showTrial && (
                <TrialCard workspaceId={details.workspaceId} trialEndsAt={details.trialEndsAt!} urgent={false} />
              )}
              {showTrial && <TrialCard workspaceId={details.workspaceId} trialEndsAt={details.trialEndsAt!} urgent />}
              {featureFlags[Feature.LAMINAR_CLOUD] && <OpenSourceCard />}
              {announcements.length > 0 && (
                <Announcements announcements={announcements} initialDismissedIds={dismissedAnnouncementIds} />
              )}
              {showUsage && <UsageCard usageDetails={details} />}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      )}
    </SidebarContent>
  );
};

export default ProjectSidebarContent;
