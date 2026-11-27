"use client";

import { User } from "lucide-react";
import { useRouter } from "next/navigation";

import { useHoverOpen } from "@/components/traces/hover-preview";
import { HeaderLinkButton } from "@/components/traces/trace-view/header/header-link-button";
import { userSessionsUrl } from "@/components/traces/trace-view/header/user-traces-url";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useProjectContext } from "@/contexts/project-context";

import UserPreview from ".";
import UserPreviewContent from "./content";

interface UsersPillProps {
  projectId: string;
  userIds: string[];
}

/**
 * One user: a link pill with the user's hover card. Several: an "N users" pill whose hover menu
 * lists them, each opening that user's card as a submenu.
 */
export default function UsersPill({ projectId, userIds }: UsersPillProps) {
  const router = useRouter();
  const { project } = useProjectContext();
  const { open, setOpen, show, hide } = useHoverOpen();

  if (userIds.length === 0) return null;

  if (userIds.length === 1) {
    const [userId] = userIds;
    return (
      <UserPreview projectId={projectId} userId={userId}>
        <HeaderLinkButton
          icon={<User size={14} className="flex-shrink-0" />}
          label={userId}
          onClick={() => router.push(userSessionsUrl(projectId, userId, project?.logRetentionDays))}
          className="h-6 max-w-56"
        />
      </UserPreview>
    );
  }

  // Non-modal so the rest of the page keeps scrolling and hovering while the menu is up.
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
      <DropdownMenuTrigger
        className="flex h-6 shrink-0 cursor-pointer items-center gap-1 rounded-md bg-emphasis-1 px-2 text-xs hover:overlay-hover"
        onMouseEnter={show}
        onMouseLeave={hide}
      >
        <User size={14} />
        {userIds.length} users
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-w-72" onMouseEnter={show} onMouseLeave={hide}>
        {userIds.map((userId) => (
          <DropdownMenuSub key={userId}>
            <DropdownMenuSubTrigger className="font-mono">
              <User className="size-3.5" />
              <span className="truncate">{userId}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuPortal>
              {/* Part of the same hover surface, so moving into the card keeps the menu open. */}
              <DropdownMenuSubContent className="p-0" onMouseEnter={show} onMouseLeave={hide}>
                <UserPreviewContent projectId={projectId} userId={userId} />
              </DropdownMenuSubContent>
            </DropdownMenuPortal>
          </DropdownMenuSub>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
