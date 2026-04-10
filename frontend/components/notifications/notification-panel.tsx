"use client";

import { ChevronDown, ChevronUp, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";

import { useNotificationPanelStore } from "@/components/notifications/notification-store";
import { useProjectContext } from "@/contexts/project-context";
import { SEVERITY_LABELS } from "@/lib/actions/alerts/types";
import { type WebNotification } from "@/lib/actions/notifications";
import { useToast } from "@/lib/hooks/use-toast";
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

interface EventIdentification {
  project_id: string;
  trace_id: string;
  event_name: string;
  extracted_information: Record<string, unknown> | null;
  severity: number;
}

const SEVERITY_TITLE_COLOR: Record<number, string> = {
  0: "text-blue-500",
  1: "text-orange-500",
  2: "text-red-500",
};

interface FormattedNotification {
  title: string;
  titleColor?: string;
  summary: string;
  aiSummary: string | null;
  noteworthyEvents: NoteworthyEvent[];
  traceLink?: { projectId: string; traceId: string };
}

const formatAlertNotification = (notification: WebNotification): FormattedNotification | null => {
  try {
    const payload: { EventIdentification: EventIdentification } = JSON.parse(notification.payload);
    const event = payload.EventIdentification;
    if (!event) return null;

    // Default to 1 (warning) for backward compatibility: old alert notifications
    // were only created when severity >= 1, so missing severity means at least warning.
    const severity = event.severity ?? 1;
    const severityLabel = (SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ?? "Info").toLowerCase();
    const titleColor = SEVERITY_TITLE_COLOR[severity] ?? SEVERITY_TITLE_COLOR[0];

    const info = event.extracted_information;
    const summaryParts: string[] = [];
    if (info && typeof info === "object") {
      for (const [key, value] of Object.entries(info)) {
        if (value !== null && value !== undefined) {
          summaryParts.push(`${key}: ${String(value)}`);
        }
      }
    }

    return {
      title: `${event.event_name} - new ${severityLabel} event`,
      titleColor,
      summary: summaryParts.length > 0 ? summaryParts.join(", ") : `A ${severityLabel} event was detected.`,
      aiSummary: null,
      noteworthyEvents: [],
      traceLink: { projectId: event.project_id, traceId: event.trace_id },
    };
  } catch {
    return null;
  }
};

const formatReportNotification = (notification: WebNotification): FormattedNotification | null => {
  try {
    const payload: { SignalsReport: SignalsReport } = JSON.parse(notification.payload);
    const report = payload.SignalsReport;
    if (!report) return null;

    const periodStartMs = new Date(report.period_start).getTime();
    const periodEndMs = new Date(report.period_end).getTime();

    // Hide weekly-style rollups to avoid duplicating info already shown by daily reports.
    if (!Number.isNaN(periodStartMs) && !Number.isNaN(periodEndMs)) {
      const periodDays = (periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24);
      if (periodDays > 3) return null;
    }

    const events = Object.values(report.signal_event_counts).reduce((a, b) => a + b, 0);
    const signalCount = Object.keys(report.signal_event_counts).length;
    const periodType = (() => {
      if (Number.isNaN(periodStartMs) || Number.isNaN(periodEndMs)) return "selected period";
      const diffDays = Math.max(1, Math.round((periodEndMs - periodStartMs) / (1000 * 60 * 60 * 24)));
      return diffDays > 1 ? `${diffDays} days` : "day";
    })();

    return {
      title: "Signal Events Summary",
      summary: `${events} new event${events !== 1 ? "s" : ""} among ${signalCount} signal${signalCount !== 1 ? "s" : ""} in the last ${periodType}`,
      aiSummary: report.ai_summary || null,
      noteworthyEvents: report.noteworthy_events ?? [],
    };
  } catch {
    return null;
  }
};

export const formatNotification = (notification: WebNotification): FormattedNotification | null => {
  if (notification.definitionType === "ALERT") {
    return formatAlertNotification(notification);
  }
  return formatReportNotification(notification);
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
  onViewed,
}: {
  notification: WebNotification;
  formatted: FormattedNotification;
  projectId?: string;
  onViewed?: (id: string) => void;
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = formatted.aiSummary || formatted.noteworthyEvents.length > 0;
  const isUnread = !notification.isRead;
  const itemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isUnread || !onViewed) return;
    const el = itemRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          onViewed(notification.id);
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isUnread, notification.id, onViewed]);

  return (
    <div
      ref={itemRef}
      className={cn(
        "flex flex-col gap-1.5 border-b px-3 py-3 transition-colors",
        isUnread ? "bg-secondary/40" : "bg-transparent"
      )}
    >
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-xs",
            formatted.titleColor ?? "text-foreground",
            isUnread ? "font-semibold" : "font-medium"
          )}
        >
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
      {formatted.traceLink && projectId && (
        <Link
          href={`/project/${formatted.traceLink.projectId}/traces/${formatted.traceLink.traceId}?chat=true`}
          className="text-[11px] text-muted-foreground underline hover:text-foreground w-fit"
          onClick={(e) => e.stopPropagation()}
        >
          View trace
        </Link>
      )}
      {hasDetails && !expanded && (
        <div className="relative cursor-pointer" onClick={() => setExpanded(true)}>
          <div className="max-h-21 overflow-hidden">
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

  const hasNotifications = formattedNotifications && formattedNotifications.length > 0;

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

  if (!isOpen) return null;

  return (
    <>
      <div className="absolute inset-0 z-40 bg-black/20" onClick={close} />
      <div className="absolute inset-y-0 left-0 z-50 w-104 max-w-full bg-background border-r shadow-lg">
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
                    onViewed={handleViewed}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default NotificationPanel;
