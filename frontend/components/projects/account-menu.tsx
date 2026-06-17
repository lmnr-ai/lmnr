"use client";

import { LogOut, Sparkles } from "lucide-react";
import Link from "next/link";

import { useSessionSync } from "@/components/auth/session-sync-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { DropdownMenuItem, DropdownMenuLabel } from "@/components/ui/dropdown-menu.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { useProjectContext } from "@/contexts/project-context.tsx";
import { useUserContext } from "@/contexts/user-context.tsx";
import { deleteLastProjectIdCookie } from "@/lib/actions/project/cookies";
import { deleteLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies";
import { signOut } from "@/lib/auth-client";
import { Feature } from "@/lib/features/features";

// Account section at the bottom of the project picker dropdown (user row + upgrade + log out).
const AccountMenu = () => {
  const user = useUserContext();
  const { workspace, settingsHref } = useProjectContext();
  const { broadcastLogout } = useSessionSync();
  const features = useFeatureFlags();

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
    <>
      <DropdownMenuLabel className="px-2 pb-1 text-secondary-foreground font-normal uppercase">
        Account
      </DropdownMenuLabel>
      <div className="flex items-center gap-2 px-2 pb-1">
        <Avatar className="size-6 rounded-md shrink-0">
          <AvatarImage src={user.image ?? ""} alt="avatar" />
          <AvatarFallback className="rounded-md text-[10px]">
            {user.name?.at(0)?.toUpperCase() || user.email?.at(0)?.toUpperCase() || "L"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          {user.name && <div className="truncate font-medium text-sidebar-foreground">{user.name}</div>}
          <div className="truncate text-secondary-foreground">{user.email}</div>
        </div>
      </div>
      {showUpgrade && (
        <DropdownMenuItem asChild className="cursor-pointer">
          <Link href={settingsHref("billing")}>
            <Sparkles className="size-4" />
            <span>Upgrade plan</span>
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={handleLogout} className="cursor-pointer">
        <LogOut className="size-4" />
        <span>Log out</span>
      </DropdownMenuItem>
    </>
  );
};

export default AccountMenu;
