"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo } from "react";

import Announcements from "@/components/announcements";
import OpenSourceCard from "@/components/project/sidebar/open-source-card.tsx";
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

      {(open || openMobile) &&
        ((featureFlags[Feature.SUBSCRIPTION] && details.isFreeTier) || featureFlags[Feature.LAMINAR_CLOUD]) && (
          <SidebarGroup className="mt-auto p-1">
            <SidebarGroupContent>
              <SidebarMenu className="gap-2">
                {featureFlags[Feature.LAMINAR_CLOUD] && <OpenSourceCard />}
                {announcements.length > 0 && (
                  <Announcements announcements={announcements} initialDismissedIds={dismissedAnnouncementIds} />
                )}
                {featureFlags[Feature.SUBSCRIPTION] && details.isFreeTier && <UsageCard usageDetails={details} />}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
    </SidebarContent>
  );
};

export default ProjectSidebarContent;
