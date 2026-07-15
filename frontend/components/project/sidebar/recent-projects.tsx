"use client";

import Link from "next/link";
import { useState } from "react";

import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu.tsx";
import { useUserContext } from "@/contexts/user-context";
import { LAST_ID_COOKIE_MAX_AGE, LAST_PROJECT_ID, LAST_WORKSPACE_ID } from "@/lib/cookies";
import { readRecentProjects, type RecentProject } from "@/lib/projects/recent";

// "Recent projects" section at the top of the sidebar project picker. Entries can
// cross workspaces, so each row carries its workspace name and clicking one writes
// both breadcrumb cookies — same synchronous document.cookie pattern as the main list.
const RecentProjects = ({ currentProjectId }: { currentProjectId: string }) => {
  const user = useUserContext();
  // Radix mounts the dropdown content on every open, so a lazy initializer reads
  // fresh data per open — no effect/setState needed. Client-only render (the
  // dropdown opens via interaction), so there's no SSR hydration concern.
  const [recents] = useState<RecentProject[]>(() =>
    readRecentProjects(user.id).filter((p) => p.id !== currentProjectId)
  );

  if (recents.length === 0) return null;

  return (
    <>
      <div className="p-1">
        <div className="px-2 py-1 truncate font-medium text-secondary-foreground">Recent</div>
        {recents.map((p) => (
          <Link
            key={p.id}
            passHref
            href={`/project/${p.id}/traces`}
            onClick={() => {
              document.cookie = `${LAST_PROJECT_ID}=${p.id};path=/;max-age=${LAST_ID_COOKIE_MAX_AGE}`;
              document.cookie = `${LAST_WORKSPACE_ID}=${p.workspaceId};path=/;max-age=${LAST_ID_COOKIE_MAX_AGE}`;
            }}
          >
            <DropdownMenuItem className="cursor-pointer">
              <span className="min-w-0 truncate text-xs text-sidebar-foreground font-medium">{p.name}</span>
              {p.workspaceName && (
                <span className="ml-auto shrink-0 truncate max-w-24 text-xs text-secondary-foreground">
                  {p.workspaceName}
                </span>
              )}
            </DropdownMenuItem>
          </Link>
        ))}
      </div>
      <DropdownMenuSeparator className="m-0" />
    </>
  );
};

export default RecentProjects;
