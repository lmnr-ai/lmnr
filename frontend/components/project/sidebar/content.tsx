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
  SidebarSectionLabel,
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
  const groups = useMemo(
    () =>
      getSidebarMenus(details.id)
        .map((group) => ({
          ...group,
          items: group.items.filter(
            (m) =>
              (m.name !== "Signals" || featureFlags[Feature.SIGNALS]) &&
              (m.name !== "Agent" || featureFlags[Feature.AGENT])
          ),
        }))
        .filter((group) => group.items.length > 0),
    [details.id, featureFlags]
  );
  const { open, openMobile } = useSidebar();
  const showUsage = featureFlags[Feature.SUBSCRIPTION] && details.isFreeTier;
  const showTrial = featureFlags[Feature.SUBSCRIPTION] && !!details.trialEndsAt;

  return (
    <SidebarContent>
      {groups.map((group, i) => (
        <SidebarGroup key={group.label ?? i} className={cn(i > 0 && "pt-2")}>
          {group.label && <SidebarSectionLabel>{group.label}</SidebarSectionLabel>}
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {group.items.map((option) => (
                <SidebarMenuItem className="h-[30px]" key={option.name}>
                  <SidebarMenuButton
                    asChild
                    className="h-[30px]"
                    isActive={pathname.startsWith(option.href)}
                    tooltip={option.name}
                  >
                    <Link href={option.href}>
                      <option.icon />
                      <span className="flex items-start gap-0.5">
                        {option.name}
                        {option.badge && (
                          <span className="text-[9px] font-medium leading-3 text-primary">{option.badge}</span>
                        )}
                      </span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}

      {(showUsage || showTrial || featureFlags[Feature.LAMINAR_CLOUD]) && (
        <SidebarGroup className={cn("mt-auto py-1 px-2", !(open || openMobile) && "hidden")}>
          <SidebarGroupContent>
            <SidebarMenu className="gap-2">
              {showTrial && <TrialCard workspaceId={details.workspaceId} trialEndsAt={details.trialEndsAt!} />}
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
