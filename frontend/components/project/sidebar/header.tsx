import { DropdownMenuLabel } from "@radix-ui/react-dropdown-menu";
import { ArrowUpLeft, ChevronsUpDown, LogOut } from "lucide-react";
import Link from "next/link";
import { signOut } from "next-auth/react";
import React from "react";

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
import { useProjectContext } from "@/contexts/project-context.tsx";
import { useUserContext } from "@/contexts/user-context.tsx";
import { cn } from "@/lib/utils.ts";

const ProjectSidebarHeader = ({ projectId, workspaceId }: { workspaceId: string; projectId: string }) => {
  const { isMobile, openMobile, open } = useSidebar();
  const { projects, project, workspace } = useProjectContext();
  const { username, imageUrl, email } = useUserContext();

  return (
    <SidebarHeader className="px-0 mt-2">
      <SidebarMenu>
        <SidebarMenuItem className="m-0 px-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton className={cn({ border: !open && !openMobile })}>
                <div className="relative flex items-center">
                  <span
                    className={cn(
                      "transition-all duration-200 ease-in-out flex items-center justify-center",
                      open || openMobile ? "opacity-0 scale-50 w-0" : "opacity-100 scale-100"
                    )}
                  >
                    {project?.name?.at(0)}
                  </span>

                  <span
                    className={cn(
                      "truncate font-medium leading-tight transition-all duration-200 ease-in-out",
                      open || openMobile ? "opacity-100 scale-100 ml-1" : "opacity-0 scale-50 absolute ml-0"
                    )}
                  >
                    {project?.name}
                  </span>
                </div>
                <ChevronsUpDown className="ml-auto size-4" />
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
                      "text-xs text-secondary-foreground py-0 px-1.5 rounded-md bg-secondary/40 font-mono border border-secondary-foreground/20",
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
  );
};

export default ProjectSidebarHeader;
