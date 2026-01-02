"use client";

import { Activity, Cloud, FolderClosed, LucideIcon, Settings, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useMemo } from "react";

import {
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar.tsx";
import { useWorkspaceMenuContext, WorkspaceMenu } from "@/components/workspace/workspace-menu-provider.tsx";
import { cn } from "@/lib/utils.ts";
import { WorkspaceTier } from "@/lib/workspaces/types.ts";

const menus: { name: string; value: WorkspaceMenu; icon: LucideIcon }[] = [
  {
    name: "Projects",
    value: "projects",
    icon: FolderClosed,
  },
  {
    name: "Usage",
    value: "usage",
    icon: Activity,
  },
  {
    name: "Team",
    value: "team",
    icon: Users,
  },
  {
    name: "Deployment",
    value: "deployment",
    icon: Cloud,
  },
  {
    name: "Settings",
    value: "settings",
    icon: Settings,
  },
];

interface WorkspaceSidebarContentProps {
  isOwner: boolean;
  workspaceFeatureEnabled: boolean;
  tier: WorkspaceTier;
}

export const WorkspaceSidebarContent = ({ isOwner, tier, workspaceFeatureEnabled }: WorkspaceSidebarContentProps) => {
  const { menu, setMenu } = useWorkspaceMenuContext();
  const pathName = usePathname();
  const sidebarMenus = useMemo(() => {
    if (!workspaceFeatureEnabled) {
      return menus.filter((m) => m.value === "projects");
    }

    return menus
      .filter((m) => tier === WorkspaceTier.PRO || m.value !== "deployment") // TODO: add filter for "hybrid deployment add-on"
      .filter((m) => isOwner || m.value !== "settings");
  }, [isOwner, workspaceFeatureEnabled, tier]);

  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {sidebarMenus.map((m) => (
              <SidebarMenuItem className="h-7" key={m.name}>
                <SidebarMenuButton
                  className={cn({
                    "bg-accent": m.value === menu,
                  })}
                  onClick={() => setMenu(m.value)}
                  asChild
                >
                  <Link href={`${pathName}?tab=${m.value}`}>
                    <m.icon />
                    <span>{m.name}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  );
};

export default WorkspaceSidebarContent;
