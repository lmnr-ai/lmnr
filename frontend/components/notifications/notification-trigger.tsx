"use client";

import { Bell } from "lucide-react";
import useSWR from "swr";

import { useNotificationPanelStore } from "@/components/notifications/notification-store";
import { useProjectContext } from "@/contexts/project-context";
import { type WebNotification } from "@/lib/actions/notifications";
import { cn, swrFetcher } from "@/lib/utils";

const NotificationTrigger = () => {
  const { workspace, project } = useProjectContext();
  const { isOpen, toggle } = useNotificationPanelStore();

  const swrKey = workspace && project ? `/api/workspaces/${workspace.id}/notifications?projectId=${project.id}` : null;
  const { data: notifications } = useSWR<WebNotification[]>(swrKey, swrFetcher);

  const hasUnread = notifications?.some((n) => !n.isRead) ?? false;

  return (
    <button
      onClick={toggle}
      className={cn(
        "relative flex items-center justify-center rounded-md p-1",
        "text-secondary-foreground hover:bg-secondary/60 transition-colors",
        isOpen && "bg-secondary/60"
      )}
    >
      <Bell className="size-4" />
      {hasUnread && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-orange-500" />}
    </button>
  );
};

export default NotificationTrigger;
