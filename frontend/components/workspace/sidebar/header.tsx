"use client";

import { DropdownMenuLabel } from "@radix-ui/react-dropdown-menu";
import { ChevronsUpDown, LogOut, Plus } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import React, { useEffect } from "react";
import useSWR from "swr";

import { useSessionSync } from "@/components/auth/session-sync-provider";
import WorkspaceCreateDialog from "@/components/projects/workspace-create-dialog.tsx";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar.tsx";
import { useUserContext } from "@/contexts/user-context.tsx";
import { deleteLastProjectIdCookie } from "@/lib/actions/project/cookies.ts";
import { deleteLastWorkspaceIdCookie, setLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies.ts";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { cn, swrFetcher } from "@/lib/utils.ts";
import { Workspace, WorkspaceWithOptionalUsers } from "@/lib/workspaces/types.ts";

interface WorkspaceSidebarHeaderProps {
  workspace: WorkspaceWithOptionalUsers;
}

const WorkspaceSidebarHeader = ({ workspace }: WorkspaceSidebarHeaderProps) => {
  const { isMobile } = useSidebar();
  const { username, imageUrl, email } = useUserContext();
  const { data, error } = useSWR<Workspace[]>("/api/workspaces", swrFetcher);
  const { toast } = useToast();
  const { broadcastLogout } = useSessionSync();

  useEffect(() => {
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  }, [error, toast]);

  const handleLogout = async () => {
    try {
      broadcastLogout();
      await deleteLastWorkspaceIdCookie();
      await deleteLastProjectIdCookie();
      await signOut({ callbackUrl: "/" });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <SidebarHeader className="px-0 mt-2">
      <SidebarMenu>
        <SidebarMenuItem className="m-0 px-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton>
                <span className="truncate font-medium flex-1 leading-tight">{workspace.name}</span>
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
              <DropdownMenuLabel className="text-muted-foreground p-1">Workspaces</DropdownMenuLabel>
              {data?.map((w) => (
                <Link key={w.id} passHref href={`/workspace/${w.id}`}>
                  <DropdownMenuItem
                    onSelect={() => setLastWorkspaceIdCookie(w.id)}
                    className={cn("cursor-pointer", {
                      "bg-accent": w.id === workspace.id,
                    })}
                  >
                    <div title={w.name} className="text-xs text-sidebar-foreground font-medium truncate">
                      {w.name}
                    </div>
                    <span
                      className={cn(
                        "text-xs text-secondary-foreground py-0 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20",
                        {
                          "border-primary bg-primary/10 text-primary": w.tierName === "Pro",
                        }
                      )}
                    >
                      {w.tierName}
                    </span>
                  </DropdownMenuItem>
                </Link>
              ))}
              <DropdownMenuSeparator />
              <WorkspaceCreateDialog>
                <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                  <Plus size={16} />
                  <span className="text-xs">Create Workspace</span>
                </DropdownMenuItem>
              </WorkspaceCreateDialog>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout}>
                <LogOut />
                <span className="text-xs">Log out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  );
};

export default WorkspaceSidebarHeader;
