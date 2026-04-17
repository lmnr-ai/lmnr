"use client";

import { AlertTriangle, ChevronDown, ChevronUp, CircleAlert, FileText, Info, X } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
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
  signal_id: string;
  trace_id: string;
  event_id: string | null;
  event_name: string;
  severity: number;
  extracted_information: Record<string, unknown> | null;
  alert_name: string;
}

interface BaseNotification {
  title: string;
  summary: string;
}

interface AlertNotification extends BaseNotification {
  kind: "alert";
  extractedFields: [string, string][];
  traceLink: string;
  similarEventsLink: string | null;
  severity: number;
}

interface ReportNotification extends BaseNotification {
  kind: "report";
  aiSummary: string | null;
  noteworthyEvents: NoteworthyEvent[];
}

type FormattedNotification = AlertNotification | ReportNotification;

const MARKDOWN_LINK_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g;

const renderWithLinks = (text: string): ReactNode => {
  const parts: ReactNode[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(MARKDOWN_LINK_RE)) {
    const [full, label, url] = match;
    const idx = match.index!;
    if (idx > lastIndex) {
      parts.push(text.slice(lastIndex, idx));
    }

    let href = url;
    try {
      const parsed = new URL(url);
      if (
        parsed.hostname === "laminar.sh" ||
        parsed.hostname.endsWith(".laminar.sh") ||
        parsed.hostname === "lmnr.ai" ||
        parsed.hostname.endsWith(".lmnr.ai")
      ) {
        href = parsed.pathname + parsed.search;
      }
    } catch {
      /* keep absolute url */
    }

    parts.push(
      <Link key={idx} href={href} className="underline hover:text-foreground" onClick={(e) => e.stopPropagation()}>
        {label}
      </Link>
    );
    lastIndex = idx + full.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
};

const formatAlertNotification = (notification: WebNotification): FormattedNotification | null => {
  try {
    const payload: { EventIdentification: EventIdentification } = JSON.parse(notification.payload);
    const event = payload.EventIdentification;
    if (!event) return null;

    // Do not show notification if severity is not specified (historical data)
    if (event.severity == null) return null;

    const severity = event.severity;

    const extractedFields: [string, string][] = event.extracted_information
      ? Object.entries(event.extracted_information).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])
      : [];

    const similarEventsLink = event.event_id
      ? `/project/${event.project_id}/signals/${event.signal_id}?eventCluster=${event.event_id}`
      : null;

    const severityLabel = SEVERITY_LABELS[severity as keyof typeof SEVERITY_LABELS] ?? "Unknown";

    return {
      kind: "alert",
      title: `${event.event_name}`,
      summary: `New ${severityLabel} event`,
      extractedFields,
      traceLink: `/project/${event.project_id}/traces/${event.trace_id}?chat=true`,
      similarEventsLink,
      severity,
    };
  } catch {
    return null;
  }
};

const formatReportNotification = (notification: WebNotification): FormattedNotification | null => {
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
      kind: "report",
      title: "Events Summary",
      summary: `${events} new event${events !== 1 ? "s" : ""} among ${signalCount} signal${signalCount !== 1 ? "s" : ""} in the last ${periodType}`,
      aiSummary,
      noteworthyEvents,
    };
  } catch {
    return null;
  }
};

export const formatNotification = (notification: WebNotification): FormattedNotification | null => {
  if (notification.definitionType === "ALERT") {
    return formatAlertNotification(notification);
  }
  if (notification.definitionType === "REPORT") {
    return formatReportNotification(notification);
  }
  return null;
};

const SeverityIcon = ({ severity }: { severity: number }) => {
  switch (severity) {
    case 1:
      return <AlertTriangle className="size-3.5 shrink-0 text-orange-400/80" />;
    case 2:
      return <CircleAlert className="size-3.5 shrink-0 text-red-400/100" />;
    default:
      return <Info className="size-3.5 shrink-0 text-muted-foreground/60" />;
  }
};

const NotificationDetails = ({ formatted, projectId }: { formatted: ReportNotification; projectId?: string }) => (
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
  const isUnread = !notification.isRead;
  const itemRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);

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

  useEffect(() => {
    const el = contentRef.current;
    if (!el || expanded) return;
    setOverflows(el.scrollHeight > el.clientHeight);
  }, [expanded, formatted]);

  const contentBody = (
    <>
      {formatted.summary && (
        <span className={cn("text-xs", isUnread ? "text-foreground/80" : "text-muted-foreground")}>
          {formatted.summary}
        </span>
      )}
      {formatted.kind === "alert" && (
        <>
          {formatted.extractedFields.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {formatted.extractedFields.map(([key, value]) => (
                <div key={key} className="flex flex-col">
                  <span className="text-[11px] font-medium text-muted-foreground">{key}</span>
                  <span
                    className={cn(
                      "text-xs leading-snug",
                      isUnread ? "text-foreground/80" : "text-secondary-foreground"
                    )}
                  >
                    {renderWithLinks(value)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-3">
            <Link
              href={formatted.traceLink}
              className="text-[11px] text-muted-foreground underline hover:text-foreground w-fit"
              onClick={(e) => e.stopPropagation()}
            >
              View trace
            </Link>
            {formatted.similarEventsLink && (
              <Link
                href={formatted.similarEventsLink}
                className="text-[11px] text-muted-foreground underline hover:text-foreground w-fit"
                onClick={(e) => e.stopPropagation()}
              >
                View similar events
              </Link>
            )}
          </div>
        </>
      )}
      {formatted.kind === "report" && <NotificationDetails formatted={formatted} projectId={projectId} />}
    </>
  );

  return (
    <div
      ref={itemRef}
      className={cn(
        "flex flex-col gap-1.5 border-b px-3 py-3 transition-colors",
        isUnread ? "bg-secondary/40" : "bg-transparent"
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {formatted.kind === "alert" ? (
            <SeverityIcon severity={formatted.severity} />
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground/60" />
          )}
          <span className={cn("text-xs", isUnread ? "font-semibold" : "font-medium")}>{formatted.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isUnread && <span className="size-1.5 rounded-full bg-orange-500 shrink-0" />}
          <span className="text-[11px] text-muted-foreground/70">{formatRelativeTime(notification.createdAt)}</span>
        </div>
      </div>
      {!expanded ? (
        <div className="relative">
          <div ref={contentRef} className="max-h-27 overflow-hidden flex flex-col gap-1.5">
            {contentBody}
          </div>
          {overflows && (
            <>
              <div
                className={cn(
                  "absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t to-transparent pointer-events-none",
                  isUnread ? "from-secondary/40" : "from-background"
                )}
              />
              <button
                onClick={() => setExpanded(true)}
                className="relative flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors w-fit mt-1"
              >
                <ChevronDown className="size-3" />
                Show more
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {contentBody}
          <button
            onClick={() => setExpanded(false)}
            className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors w-fit"
          >
            <ChevronUp className="size-3" />
            Show less
          </button>
        </div>
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
