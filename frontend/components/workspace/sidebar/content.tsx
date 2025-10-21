import { Activity, FolderClosed, LucideIcon, Settings, Users } from "lucide-react";
import React from "react";

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

const WorkspaceSidebarContent = () => {
  const { menu, setMenu } = useWorkspaceMenuContext();
  return (
    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            {menus.map((m) => (
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
