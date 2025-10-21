"use client";

import { DropdownMenuLabel } from "@radix-ui/react-dropdown-menu";
import { ArrowUpLeft, ChevronsUpDown, LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import React, { useEffect, useMemo, useState } from "react";

import { getSidebarMenus } from "@/components/project/utils.ts";
import SidebarFooter from "@/components/projects/sidebar-footer.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useProjectContext } from "@/contexts/project-context.tsx";
import { useUserContext } from "@/contexts/user-context.tsx";
import { cn } from "@/lib/utils.ts";

interface ProjectSidebarProps {
  workspaceId: string;
  projectId: string;
  isFreeTier: boolean;
  gbUsedThisMonth?: number;
  gbLimit?: number;
}

const UsageDisplay = ({
  gbUsed,
  gbLimit,
  workspaceId,
  open,
}: {
  gbUsed: number;
  gbLimit: number;
  workspaceId: string;
  open: boolean;
}) => {
  const formatGB = (gb: number) => {
    if (gb < 0.001) {
      return `${(gb * 1024).toFixed(0)} MB`;
    }
    return `${gb.toFixed(1)} GB`;
  };

  const usagePercentage = gbLimit > 0 ? Math.min((gbUsed / gbLimit) * 100, 100) : 0;
  const title = `${formatGB(gbUsed)} of ${formatGB(gbLimit)}`;

  if (!open) return null;

  return (
    <div className="p-2 m-2 rounded-lg border bg-muted/30 text-xs">
      <div className="text-muted-foreground mb-2">Free plan usage</div>
      <div className="flex flex-col gap-2">
        <div title={title} className="font-medium truncate">
          {title}
        </div>
        <Progress value={usagePercentage} className="h-1" />
        <Link href={`/workspace/${workspaceId}`}>
          <Button className="w-full h-6">Upgrade</Button>
        </Link>
      </div>
    </div>
  );
};

export default function ProjectSidebar({
  workspaceId,
  projectId,
  isFreeTier,
  gbUsedThisMonth = 0,
  gbLimit = 1,
}: ProjectSidebarProps) {
  const pathname = usePathname();
  const { open, openMobile, isMobile } = useSidebar();
  const [showStarCard, setShowStarCard] = useState(false);
  const { projects, project, workspace } = useProjectContext();
  const { username, imageUrl, email } = useUserContext();
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("showStarCard");
      setShowStarCard(saved !== null ? JSON.parse(saved) : true);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("showStarCard", JSON.stringify(showStarCard));
    }
  }, [showStarCard]);

  const options = useMemo(() => getSidebarMenus(projectId), [projectId]);

  return (
    <Sidebar className="border-none" collapsible="icon">
      <SidebarHeader className="px-0 mt-2">
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton className="w-[calc(100%_-_16px)] p-1">
                  <span className="truncate font-medium flex-1 leading-tight ml-1">{project?.name}</span>
                  <ChevronsUpDown className="ml-auto" />
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg text-xs"
                align="start"
                sideOffset={4}
                side={isMobile ? "bottom" : "right"}
              >
                <DropdownMenuLabel className="flex gap-2 p-1">
                  <Avatar className="h-8 w-8 rounded-lg">
                    <AvatarImage src={imageUrl} alt="avatar" />
                    <AvatarFallback className="rounded-lg">{username?.at(0)?.toUpperCase() || "L"}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left leading-tight">
                    <span className="text-muted-foreground">Logged in as</span>
                    <span className="text-sidebar-foreground">{email}</span>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="text-muted-foreground p-1">Projects</DropdownMenuLabel>
                {projects.map((project) => (
                  <Link key={project.id} passHref href={`/project/${project.id}/traces`}>
                    <DropdownMenuItem
                      className={cn("cursor-pointer", {
                        "bg-accent": project.id === projectId,
                      })}
                    >
                      <span className="text-xs text-sidebar-foreground font-medium">{project.name}</span>
                    </DropdownMenuItem>
                  </Link>
                ))}
                <DropdownMenuSeparator />
                <Link passHref href={`/workspace/${workspaceId}`}>
                  <DropdownMenuItem className="cursor-pointer">
                    <ArrowUpLeft />
                    <span className="text-xs truncate">{workspace?.name}</span>
                    <span
                      className={cn(
                        "text-xs text-secondary-foreground p-0.5 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20",
                        {
                          "border-primary bg-primary/10 text-primary": workspace?.tierName === "Pro",
                        }
                      )}
                    >
                      {workspace?.tierName}
                    </span>
                  </DropdownMenuItem>
                </Link>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut />
                  <span className="text-xs">Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
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

        {isFreeTier && (open || openMobile) && (
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <UsageDisplay
                    gbUsed={gbUsedThisMonth}
                    gbLimit={gbLimit}
                    workspaceId={workspaceId}
                    open={open || openMobile}
                  />
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
      <SidebarFooter />
    </Sidebar>
  );
}
