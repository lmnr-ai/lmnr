"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo } from "react";

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
import { Feature } from "@/lib/features/features";

const ProjectSidebarContent = ({ details }: { details: ProjectDetails }) => {
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
              <SidebarMenu className="gap-1">
                {featureFlags[Feature.LAMINAR_CLOUD] && <OpenSourceCard />}
                {featureFlags[Feature.SUBSCRIPTION] && details.isFreeTier && <UsageCard usageDetails={details} />}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
    </SidebarContent>
  );
};

export default ProjectSidebarContent;
