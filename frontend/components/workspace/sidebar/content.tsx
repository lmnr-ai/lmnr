"use client";

import { Activity, Cloud, CreditCard, FolderClosed, type LucideIcon, Settings, Users } from "lucide-react";
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
import { type WorkspaceTier } from "@/lib/workspaces/types.ts";

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
    name: "Data Residency",
    value: "deployment",
    icon: Cloud,
  },
  {
    name: "Billing",
    value: "billing",
    icon: CreditCard,
  },
  {
    name: "Settings",
    value: "settings",
    icon: Settings,
  },
];

interface WorkspaceSidebarContentProps {
  isOwner: boolean;
  tier: WorkspaceTier;
  isBillingEnabled: boolean;
  isDeploymentEnabled: boolean;
}

export const WorkspaceSidebarContent = ({
  isOwner,
  tier,
  isBillingEnabled,
  isDeploymentEnabled,
}: WorkspaceSidebarContentProps) => {
  const { menu, setMenu } = useWorkspaceMenuContext();
  const pathName = usePathname();
  const sidebarMenus = useMemo(
    () =>
      menus.filter((m) => {
        if (m.value === "settings" && !isOwner) return false;
        if (m.value === "billing" && !isBillingEnabled) return false;
        if (m.value === "deployment" && !isDeploymentEnabled) return false;
        return true;
      }),
    [isOwner, isBillingEnabled, isDeploymentEnabled]
  );

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
