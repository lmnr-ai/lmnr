"use client";

import { Activity, FolderClosed, type LucideIcon, Settings, Users } from "lucide-react";
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
import { useWorkspaceMenuContext, type WorkspaceMenu } from "@/components/workspace/workspace-menu-provider.tsx";
import { cn } from "@/lib/utils.ts";

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
    name: "Settings",
    value: "settings",
    icon: Settings,
  },
];

interface WorkspaceSidebarContentProps {
  isOwner: boolean;
  workspaceFeatureEnabled: boolean;
}

export const WorkspaceSidebarContent = ({ isOwner, workspaceFeatureEnabled }: WorkspaceSidebarContentProps) => {
  const { menu, setMenu } = useWorkspaceMenuContext();
  const pathName = usePathname();
  const sidebarMenus = useMemo(() => {
    if (!workspaceFeatureEnabled) {
      return menus.filter((m) => m.value === "projects");
    }

    return isOwner ? menus : menus.filter((m) => m.value !== "settings");
  }, [isOwner, workspaceFeatureEnabled]);

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
