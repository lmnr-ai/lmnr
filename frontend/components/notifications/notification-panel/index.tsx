"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Settings, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWR from "swr";

import { NotificationItem } from "@/components/notifications/notification-panel/notification-item";
import {
  SeverityFilter,
  type SeverityFilterValue,
} from "@/components/notifications/notification-panel/severity-filter";
import { formatNotification, type FormattedNotification } from "@/components/notifications/notification-panel/utils";
import { useNotificationPanelStore } from "@/components/notifications/notification-store";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProjectContext } from "@/contexts/project-context";
import { type WebNotification } from "@/lib/actions/notifications";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

// Re-exported so existing `@/components/notifications/notification-panel`
// imports (e.g. notification-trigger.tsx) keep resolving without changes.
export { formatNotification } from "@/components/notifications/notification-panel/utils";

const NotificationPanel = () => {
  const { isOpen, close } = useNotificationPanelStore();
  const { workspace, project } = useProjectContext();
  const { toast } = useToast();

  const swrKey = workspace && project ? `/api/workspaces/${workspace.id}/notifications?projectId=${project.id}` : null;

  const { data: notifications, mutate } = useSWR<WebNotification[]>(swrKey, swrFetcher);

  const formattedNotifications = notifications
    ?.map((n) => ({
      notification: n,
      formatted: formatNotification(n),
    }))
    .filter(
      (item): item is { notification: WebNotification; formatted: FormattedNotification } => item.formatted !== null
    );

  const [severityFilter, setSeverityFilter] = useState<SeverityFilterValue>("all");

  // Reset filter when the panel closes so reopening starts fresh. The lint rule against
  // setState-in-effect targets cascading renders, but this only fires on close transitions
  // (panel hidden) so the extra render is invisible and infrequent.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!isOpen) setSeverityFilter("all");
  }, [isOpen]);

  const counts = useMemo(() => {
    const base = { all: 0, critical: 0, warning: 0, info: 0 };
    formattedNotifications?.forEach(({ formatted }) => {
      base.all += 1;
      // Non-alert notifications (reports, clusters) have no severity — bucket them as info.
      if (formatted.kind !== "alert") {
        base.info += 1;
        return;
      }
      if (formatted.severity === 2) base.critical += 1;
      else if (formatted.severity === 1) base.warning += 1;
      else base.info += 1;
    });
    return base;
  }, [formattedNotifications]);

  const visibleNotifications = useMemo(() => {
    if (severityFilter === "all") return formattedNotifications;
    return formattedNotifications?.filter(({ formatted }) => {
      if (formatted.kind !== "alert") return severityFilter === "info";
      if (severityFilter === "critical") return formatted.severity === 2;
      if (severityFilter === "warning") return formatted.severity === 1;
      return formatted.severity === 0;
    });
  }, [formattedNotifications, severityFilter]);

  const hasVisibleNotifications = visibleNotifications && visibleNotifications.length > 0;
  const hasAnyNotifications = formattedNotifications && formattedNotifications.length > 0;

  const pendingIdsRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flush sends all pending viewed notification IDs to the server in one batch.
  // Three call sites may invoke flushViewed in close succession: the 500ms debounce
  // timer, the isOpen effect (panel close), and the unmount cleanup. This is safe
  // because JS is single-threaded — clear() + Array.from is atomic within a tick,
  // and the size === 0 guard ensures subsequent calls are no-ops.
  const flushViewed = useCallback(() => {
    if (!workspace || !project || pendingIdsRef.current.size === 0) return;

    const ids = Array.from(pendingIdsRef.current);
    pendingIdsRef.current.clear();

    mutate((current) => current?.map((n) => (ids.includes(n.id) ? { ...n, isRead: true } : n)), false);

    fetch(`/api/workspaces/${workspace.id}/notifications`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationIds: ids, projectId: project.id }),
    })
      .then((res) => {
        if (!res.ok) {
          mutate();
          toast({ variant: "destructive", title: "Failed to mark notifications as read" });
        }
      })
      .catch(() => {
        mutate();
        toast({ variant: "destructive", title: "Failed to mark notifications as read" });
      });
  }, [workspace, project, mutate, toast]);

  useEffect(() => {
    if (!isOpen) {
      flushViewed();
    }
  }, [isOpen, flushViewed]);

  useEffect(
    () => () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushViewed();
    },
    [flushViewed]
  );

  const handleViewed = useCallback(
    (id: string) => {
      pendingIdsRef.current.add(id);
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      flushTimerRef.current = setTimeout(flushViewed, 500);
    },
    [flushViewed]
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            key="notification-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute inset-0 z-40 bg-black/20"
            onClick={close}
          />
          <motion.div
            key="notification-panel"
            initial={{ x: "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="absolute inset-y-0 left-0 z-50 w-104 max-w-full bg-background border-r shadow-lg"
            onClickCapture={(e) => {
              if ((e.target as HTMLElement).closest("a")) close();
            }}
          >
            <div className="flex flex-col h-full">
              <div className="flex items-center justify-between pl-3 pr-2 py-2 shrink-0">
                <span className="text-sm font-medium">Notifications</span>
                <div className="flex items-center gap-1">
                  {project && (
                    <Link
                      href={`/project/${project.id}/settings?tab=alerts`}
                      onClick={close}
                      title="Alert settings"
                      className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                    >
                      <Settings className="size-4" />
                    </Link>
                  )}
                  <button
                    onClick={close}
                    className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              </div>
              {hasAnyNotifications && (
                <SeverityFilter value={severityFilter} onChange={setSeverityFilter} counts={counts} />
              )}
              {/* Radix Viewport wraps children in `display: table; min-width: 100%`, which auto-sizes to
                  max-content and lets unbreakable strings (URLs, IDs) push past 100%. The clipped overflow
                  reads as "text going off the right edge." Forcing the inner wrapper to `display: block`
                  re-anchors width to the viewport so children wrap normally. */}
              <ScrollArea className="flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
                {!hasAnyNotifications ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No notifications yet
                  </div>
                ) : !hasVisibleNotifications ? (
                  <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                    No notifications match this filter
                  </div>
                ) : (
                  <div className="flex flex-col">
                    {visibleNotifications.map(({ notification, formatted }) => (
                      <NotificationItem
                        key={notification.id}
                        notification={notification}
                        formatted={formatted}
                        projectId={project?.id}
                        onViewed={handleViewed}
                      />
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default NotificationPanel;
