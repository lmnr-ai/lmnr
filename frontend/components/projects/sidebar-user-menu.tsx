"use client";

import { LogOut, Sparkles } from "lucide-react";
import Link from "next/link";

import { useSessionSync } from "@/components/auth/session-sync-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { useProjectContext } from "@/contexts/project-context.tsx";
import { useUserContext } from "@/contexts/user-context.tsx";
import { deleteLastProjectIdCookie } from "@/lib/actions/project/cookies";
import { deleteLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies";
import { signOut } from "@/lib/auth-client";
import { Feature } from "@/lib/features/features";

const SidebarUserMenu = () => {
  const { open, openMobile } = useSidebar();
  const user = useUserContext();
  const { workspace } = useProjectContext();
  const { broadcastLogout } = useSessionSync();
  const features = useFeatureFlags();

  const expanded = open || openMobile;
  const showUpgrade = features[Feature.SUBSCRIPTION] && workspace?.tierName !== "Pro";

  const handleLogout = async () => {
    try {
      await deleteLastWorkspaceIdCookie();
      await deleteLastProjectIdCookie();
      await signOut();
      broadcastLogout();
      window.location.href = "/";
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <SidebarMenuButton className="flex items-center gap-2" tooltip={user.email ?? "Account"}>
          <Avatar className="size-6 rounded-md shrink-0">
            <AvatarImage src={user.image ?? ""} alt="avatar" />
            <AvatarFallback className="rounded-md text-[10px]">
              {user.name?.at(0)?.toUpperCase() || user.email?.at(0)?.toUpperCase() || "L"}
            </AvatarFallback>
          </Avatar>
          {expanded && <span className="min-w-0 flex-1 truncate text-left">{user.email}</span>}
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="w-(--radix-dropdown-menu-trigger-width) rounded-lg text-xs bg-landing-surface-600"
        align="start"
        sideOffset={4}
        side="top"
      >
        {showUpgrade && (
          <DropdownMenuItem asChild className="cursor-pointer">
            <Link href={`/workspace/${workspace?.id}?tab=billing`}>
              <Sparkles className="size-4" />
              <span>Upgrade plan</span>
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
          <LogOut className="size-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default SidebarUserMenu;
