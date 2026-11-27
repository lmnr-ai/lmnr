"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo } from "react";

import SidebarBottomCards from "@/components/project/sidebar/bottom-cards";
import { getSidebarMenus } from "@/components/project/utils.ts";
import SidebarSignals from "@/components/signal-clusters/sidebar-signals";
import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSectionLabel,
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

  return (
    <>
      <SidebarContent className="scroll-fade-y minimal-scrollbar">
        {groups.map((group, i) => (
          <SidebarGroup key={group.label ?? i} className={cn(i > 0 && "pt-2")}>
            {group.label && <SidebarSectionLabel>{group.label}</SidebarSectionLabel>}
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {group.items.map((option) =>
                  option.name === "Signals" ? (
                    <SidebarSignals key={option.name} href={option.href} icon={option.icon} />
                  ) : (
                    <SidebarMenuItem className="h-[30px]" key={option.name}>
                      <SidebarMenuButton
                        asChild
                        className="h-[30px]"
                        isActive={[option.href, ...(option.alsoActiveOn ?? [])].some((h) => pathname.startsWith(h))}
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
                  )
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarBottomCards
        announcements={announcements}
        details={details}
        dismissedAnnouncementIds={dismissedAnnouncementIds}
      />
    </>
  );
};

export default ProjectSidebarContent;
