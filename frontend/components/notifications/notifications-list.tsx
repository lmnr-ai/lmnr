"use client";

import { Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import useSWR from "swr";

import CreateNotificationSheet from "@/components/notifications/create-notification-sheet";
import { SettingsTable, SettingsTableRow } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { type NotificationWithDetails } from "@/lib/actions/notifications";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

interface NotificationsListProps {
  projectId: string;
  workspaceId: string;
  integrationId: string;
}

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export default function NotificationsList({ projectId, workspaceId, integrationId }: NotificationsListProps) {
  const { toast } = useToast();
  const [deleteTarget, setDeleteTarget] = useState<NotificationWithDetails | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const {
    data: notifications,
    isLoading,
    mutate,
  } = useSWR<NotificationWithDetails[]>(`/api/projects/${projectId}/notifications`, swrFetcher);

  const handleDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/notifications`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: deleteTarget.id }),
      });

      if (!res.ok) {
        const error = (await res.json().catch(() => ({ error: "Failed to delete" }))) as { error: string };
        throw new Error(error?.error ?? "Failed to delete notification");
      }

      toast({ title: "Notification deleted" });
      await mutate();
    } catch (e) {
      toast({
        title: "Error deleting notification",
        variant: "destructive",
        description: e instanceof Error ? e.message : "Failed to delete notification",
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, projectId, mutate, toast]);

  return (
    <>
      <div className="flex items-center justify-between">
        <CreateNotificationSheet
          projectId={projectId}
          workspaceId={workspaceId}
          integrationId={integrationId}
          onCreated={() => mutate()}
        />
      </div>

      <SettingsTable
        isLoading={isLoading}
        isEmpty={!notifications || notifications.length === 0}
        emptyMessage="No notifications yet. Click 'Notification' to create one."
      >
        <SettingsTableRow>
          <th className="text-left text-xs font-medium text-muted-foreground p-2">Name</th>
          <th className="text-left text-xs font-medium text-muted-foreground p-2">Trigger</th>
          <th className="text-left text-xs font-medium text-muted-foreground p-2">Channels</th>
          <th className="text-left text-xs font-medium text-muted-foreground p-2">Created</th>
          <th className="w-10 p-2" />
        </SettingsTableRow>
        {notifications?.map((notif) => (
          <SettingsTableRow key={notif.id}>
            <td className="p-2 text-sm font-medium">{notif.name}</td>
            <td className="p-2">
              {notif.triggers.map((t) => (
                <Badge key={t.id} variant="outline" className="text-xs">
                  {t.type}
                </Badge>
              ))}
            </td>
            <td className="p-2 text-sm text-muted-foreground">
              {notif.actions.map((a) => `#${a.channelName}`).join(", ") || "—"}
            </td>
            <td className="p-2 text-xs text-muted-foreground">{dateFormatter.format(new Date(notif.createdAt))}</td>
            <td className="p-2">
              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(notif)}>
                <Trash2 size={14} className="text-muted-foreground" />
              </Button>
            </td>
          </SettingsTableRow>
        ))}
      </SettingsTable>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete notification"
        description={
          deleteTarget
            ? `Are you sure you want to delete "${deleteTarget.name}"? This will remove all associated triggers and Slack channel subscriptions.`
            : ""
        }
        onConfirm={handleDelete}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
      />
    </>
  );
}
