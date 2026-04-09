"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { useNotificationPanelStore } from "@/components/notifications/notification-store";
import { useProjectContext } from "@/contexts/project-context";
import { type WebNotification } from "@/lib/actions/notifications";
import { cn, formatRelativeTime, swrFetcher } from "@/lib/utils";

interface NoteworthyEvent {
  signal_name: string;
  summary: string;
  timestamp: string;
  trace_id: string;
}

interface SignalsReport {
  workspace_name: string;
  project_id: string;
  project_name: string;
  title: string;
  period_label: string;
  period_start: string;
  period_end: string;
  signal_event_counts: Record<string, number>;
  ai_summary: string;
  noteworthy_events: NoteworthyEvent[];
}

interface FormattedNotification {
  title: string;
  summary: string;
  aiSummary: string | null;
  noteworthyEvents: NoteworthyEvent[];
}

// TODO: refactor this to have a more generic notification format, currently implemented only for signal events reports
export const formatNotification = (notification: WebNotification): FormattedNotification | null => {
  try {
    const payload: { SignalsReport: SignalsReport } = JSON.parse(notification.payload);
    const report = payload.SignalsReport;
    if (!report) {
      return null;
    }

    const periodStartMs = new Date(report.period_start).getTime();
    const periodEndMs = new Date(report.period_end).getTime();

    // Hide weekly-style rollups to avoid duplicating info already shown by daily reports.
    if (!Number.isNaN(periodStartMs) && !Number.isNaN(periodEndMs)) {
      const periodDays = (periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24);
      if (periodDays > 3) {
        return null;
      }
    }

    const events = Object.values(report.signal_event_counts).reduce((a, b) => a + b, 0);
    const signalCount = Object.keys(report.signal_event_counts).length;
    const periodType = (() => {
      if (Number.isNaN(periodStartMs) || Number.isNaN(periodEndMs)) {
        return "selected period";
      }

      const diffDays = Math.max(1, Math.round((periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24)));
      if (diffDays > 1) {
        return `${diffDays} days`;
      }
      return "day";
    })();

    const aiSummary = report.ai_summary || null;
    const noteworthyEvents = report.noteworthy_events ?? [];

    return {
      title: "Signal Events Summary",
      summary: `${events} new event${events !== 1 ? "s" : ""} among ${signalCount} signal${signalCount !== 1 ? "s" : ""} in the last ${periodType}`,
      aiSummary,
      noteworthyEvents,
    };
  } catch {
    return null;
  }
};

const NotificationDetails = ({ formatted, projectId }: { formatted: FormattedNotification; projectId?: string }) => (
  <>
    {formatted.aiSummary && (
      <div className="flex flex-col gap-1 mt-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Summary</span>
        <p className="text-xs text-secondary-foreground leading-relaxed">{formatted.aiSummary}</p>
      </div>
    )}
    {formatted.noteworthyEvents.length > 0 && (
      <div className="flex flex-col gap-1.5 mt-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Noteworthy events</span>
        {formatted.noteworthyEvents.slice(0, 3).map((event) => (
          <div key={event.trace_id} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-foreground">{event.signal_name}</span>
              <span className="text-[10px] text-muted-foreground/70">{formatRelativeTime(event.timestamp)}</span>
            </div>
            <span className="text-xs text-muted-foreground leading-snug">{event.summary}</span>
            {projectId && (
              <Link
                href={`/project/${projectId}/traces/${event.trace_id}?chat=true`}
                className="text-[11px] text-muted-foreground underline hover:text-foreground mt-0.5 w-fit"
                onClick={(e) => e.stopPropagation()}
              >
                View trace
              </Link>
            )}
          </div>
        ))}
      </div>
    )}
  </>
);

const NotificationItem = ({
  notification,
  formatted,
  projectId,
  onMarkAsRead,
}: {
  notification: WebNotification;
  formatted: FormattedNotification;
  projectId?: string;
  onMarkAsRead: (notificationId: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = formatted.aiSummary || formatted.noteworthyEvents.length > 0;
  const isUnread = !notification.isRead;

  const markAsRead = () => {
    if (isUnread) {
      onMarkAsRead(notification.id);
    }
  };

  const handleExpand = () => {
    setExpanded(true);
    markAsRead();
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 border-b px-3 py-3 transition-colors",
        isUnread ? "bg-secondary/40 cursor-pointer" : "bg-transparent"
      )}
      onClick={markAsRead}
    >
      <div className="flex items-center justify-between">
        <span className={cn("text-xs text-foreground", isUnread ? "font-semibold" : "font-medium")}>
          {formatted.title}
        </span>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isUnread && <span className="size-1.5 rounded-full bg-orange-500 shrink-0" />}
          <span className="text-[11px] text-muted-foreground/70">{formatRelativeTime(notification.createdAt)}</span>
        </div>
      </div>
      <span className={cn("text-xs", isUnread ? "text-foreground/80" : "text-muted-foreground")}>
        {formatted.summary}
      </span>
      {hasDetails && !expanded && (
        <div
          className="relative cursor-pointer"
          onClick={(e) => {
            e.stopPropagation();
            handleExpand();
          }}
        >
          <div className="max-h-22 overflow-hidden">
            <NotificationDetails formatted={formatted} projectId={projectId} />
          </div>
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent pointer-events-none",
              isUnread ? "from-secondary/40" : "from-background"
            )}
          />
          <button className="relative flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors w-fit mt-1">
            <ChevronDown className="size-3" />
            Show more
          </button>
        </div>
      )}
      {expanded && (
        <>
          <NotificationDetails formatted={formatted} projectId={projectId} />
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors w-fit"
          >
            <ChevronUp className="size-3" />
            Show less
          </button>
        </>
      )}
    </div>
  );
};

const NotificationPanel = () => {
  const { isOpen, close } = useNotificationPanelStore();
  const { workspace, project } = useProjectContext();

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

  const hasNotifications = formattedNotifications && formattedNotifications.length > 0;

  const handleMarkAsRead = async (notificationId: string) => {
    if (!workspace || !project) return;

    mutate((current) => current?.map((n) => (n.id === notificationId ? { ...n, isRead: true } : n)), false);

    try {
      const res = await fetch(`/api/workspaces/${workspace.id}/notifications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId, projectId: project.id }),
      });
      if (!res.ok) {
        mutate();
      }
    } catch {
      mutate();
    }
  };

  return (
    <div
      className={cn(
        "absolute inset-y-0 left-0 z-50 w-104 bg-background border-r shadow-lg",
        "transition-transform duration-200 ease-in-out",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}
    >
      <div className="flex flex-col h-full">
        <div className="flex items-center justify-between border-b px-3 py-2 shrink-0">
          <span className="text-sm font-medium">Notifications</span>
          <button
            onClick={close}
            className="flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {!hasNotifications ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="flex flex-col">
              {formattedNotifications.map(({ notification, formatted }) => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  formatted={formatted}
                  projectId={project?.id}
                  onMarkAsRead={handleMarkAsRead}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationPanel;
