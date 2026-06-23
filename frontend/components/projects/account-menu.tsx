"use client";

import { LogOut, Sparkles } from "lucide-react";
import Link from "next/link";

import { useSessionSync } from "@/components/auth/session-sync-provider";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar.tsx";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu.tsx";
import { useFeatureFlags } from "@/contexts/feature-flags-context.tsx";
import { useProjectContext } from "@/contexts/project-context.tsx";
import { useUserContext } from "@/contexts/user-context.tsx";
import { deleteLastProjectIdCookie } from "@/lib/actions/project/cookies";
import { deleteLastWorkspaceIdCookie } from "@/lib/actions/workspace/cookies";
import { signOut } from "@/lib/auth-client";
import { Feature } from "@/lib/features/features";
import { withBasePath } from "@/lib/utils";
import { WorkspaceTier } from "@/lib/workspaces/types";

// Account section at the bottom of the project picker dropdown (user row + upgrade + log out).
const AccountMenu = () => {
  const user = useUserContext();
  const { workspace, settingsHref } = useProjectContext();
  const { broadcastLogout } = useSessionSync();
  const features = useFeatureFlags();

  // Only Free workspaces should be nudged to upgrade — paid tiers (Hobby/Pro/Enterprise) shouldn't.
  const showUpgrade = features[Feature.SUBSCRIPTION] && workspace?.tierName === WorkspaceTier.FREE;

  const handleLogout = async () => {
    try {
      await deleteLastWorkspaceIdCookie();
      await deleteLastProjectIdCookie();
      await signOut();
      broadcastLogout();
      window.location.href = withBasePath("/");
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2 px-2 pt-1 pb-1.5">
        <Avatar className="size-6 rounded-md shrink-0">
          <AvatarImage src={user.image ?? ""} alt="avatar" />
          <AvatarFallback className="rounded-md text-[10px] bg-surface-300">
            {user.name?.at(0)?.toUpperCase() || user.email?.at(0)?.toUpperCase() || "L"}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-secondary-foreground">Logged in as</div>
          <div className="truncate text-sidebar-foreground">{user.email}</div>
        </div>
      </div>
      {showUpgrade && (
        <DropdownMenuItem asChild className="cursor-pointer gap-2">
          <Link href={settingsHref("billing")}>
            <span className="flex size-6 items-center justify-center shrink-0">
              <Sparkles className="size-4" />
            </span>
            <span>Upgrade plan</span>
          </Link>
        </DropdownMenuItem>
      )}
      <DropdownMenuItem onClick={handleLogout} className="cursor-pointer gap-2">
        <span className="flex size-6 items-center justify-center shrink-0">
          <LogOut className="size-4" />
        </span>
        <span>Log out</span>
      </DropdownMenuItem>
    </>
  );
};

export default AccountMenu;
