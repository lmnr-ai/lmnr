"use client";

import { Bell } from "lucide-react";
import useSWR from "swr";

import { formatNotification } from "@/components/notifications/notification-panel";
import { useNotificationPanelStore } from "@/components/notifications/notification-store";
import { Button } from "@/components/ui/button";
import { useProjectContext } from "@/contexts/project-context";
import { type WebNotification } from "@/lib/actions/notifications";
import { track } from "@/lib/posthog";
import { cn, swrFetcher } from "@/lib/utils";

const NotificationTrigger = () => {
  const { workspace, project } = useProjectContext();
  const { isOpen, toggle } = useNotificationPanelStore();

  const swrKey = workspace && project ? `/api/workspaces/${workspace.id}/notifications?projectId=${project.id}` : null;
  const { data: notifications } = useSWR<WebNotification[]>(swrKey, swrFetcher);

  const hasUnread = notifications?.some((n) => !n.isRead && formatNotification(n) !== null) ?? false;

  const handleClick = () => {
    // Fire only on open — collapse is less interesting for reach tracking.
    if (!isOpen) {
      track("notifications", "panel_opened", { hasUnread });
    }
    toggle();
  };

  return (
    <Button
      onClick={handleClick}
      variant="ghost"
      size="icon-sm"
      className={cn("relative text-secondary-foreground hover:bg-secondary/60", isOpen && "bg-secondary/60")}
    >
      <Bell className="size-4" />
      {hasUnread && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-orange-500" />}
    </Button>
  );
};

export default NotificationTrigger;
