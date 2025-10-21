import { Activity, FolderClosed, LucideIcon, Settings, Users } from "lucide-react";
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

const WorkspaceSidebarContent = ({ isOwner }: { isOwner: boolean }) => {
  const { menu, setMenu } = useWorkspaceMenuContext();
  const sidebarMenus = useMemo(() => {
    if (!isOwner) {
      return menus.filter((m) => m.value !== "settings");
    }

    return menus;
  }, [isOwner]);

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
                  <div className="cursor-pointer">
                    <m.icon />
                    <span>{m.name}</span>
                  </div>
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
