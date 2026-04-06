"use client";

import { Bell, ChevronDown, ChevronUp } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import useSWR from "swr";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjectContext } from "@/contexts/project-context";
import { type WebNotification } from "@/lib/actions/notifications";
import { cn, formatRelativeTime, swrFetcher } from "@/lib/utils";

interface NoteworthyEvent {
  signal_name: string;
  summary: string;
  timestamp: string;
  trace_id: string;
}

interface ReportProject {
  project_name: string;
  project_id: string;
  signal_event_counts: Record<string, number>;
  ai_summary: string;
  noteworthy_events: NoteworthyEvent[];
}

interface ReportPayload {
  title: string;
  report: {
    workspace_id: string;
    workspace_name: string;
    period_label: string;
    period_start: string;
    period_end: string;
    total_events: number;
    projects: ReportProject[];
  };
}

interface FormattedNotification {
  title: string;
  summary: string;
  aiSummary: string | null;
  noteworthyEvents: NoteworthyEvent[];
  projectId: string | null;
}

const formatNotification = (notification: WebNotification, projectId?: string): FormattedNotification | null => {
  try {
    const payload: ReportPayload = JSON.parse(notification.payload);
    const report = payload.report;
    const project = projectId ? report.projects.find((p) => p.project_id === projectId) : undefined;

    if (projectId && !project) {
      return null;
    }

    const events = project
      ? Object.values(project.signal_event_counts).reduce((a, b) => a + b, 0)
      : report.total_events;
    const signalCount = project
      ? Object.keys(project.signal_event_counts).length
      : report.projects.reduce((acc, p) => acc + Object.keys(p.signal_event_counts).length, 0);
    const startMs = new Date(report.period_start).getTime();
    const endMs = new Date(report.period_end).getTime();
    const diffDays =
      Number.isNaN(startMs) || Number.isNaN(endMs) ? NaN : Math.round((endMs - startMs) / (1000 * 60 * 60 * 24));
    const periodType = diffDays >= 7 ? "week" : diffDays > 1 ? `${diffDays} days` : "day";

    const aiSummary = project?.ai_summary ?? null;
    const noteworthyEvents = project ? project.noteworthy_events : report.projects.flatMap((p) => p.noteworthy_events);

    return {
      title: `Events Summary`,
      summary: `${events} new event${events !== 1 ? "s" : ""} among ${signalCount} signal${signalCount !== 1 ? "s" : ""} during last ${periodType}`,
      aiSummary,
      noteworthyEvents,
      projectId: project?.project_id ?? null,
    };
  } catch {
    return null;
  }
};

const NotificationItem = ({
  notification,
  formatted,
  projectId,
}: {
  notification: WebNotification;
  formatted: FormattedNotification;
  projectId?: string;
}) => {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = formatted.aiSummary || formatted.noteworthyEvents.length > 0;

  return (
    <div className="flex flex-col gap-1.5 border-b last:border-b-0 px-3 py-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-foreground">{formatted.title}</span>
        <span className="text-[11px] text-muted-foreground/70 shrink-0 ml-2">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </div>
      <span className="text-xs text-muted-foreground">{formatted.summary}</span>
      {hasDetails && (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          {expanded ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {expanded ? "Show less" : "Show details"}
        </button>
      )}
      {expanded && (
        <>
          {formatted.aiSummary && (
            <p className="text-xs text-secondary-foreground leading-relaxed">{formatted.aiSummary}</p>
          )}
          {formatted.noteworthyEvents.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Noteworthy events
              </span>
              {formatted.noteworthyEvents.map((event, i) => (
                <div key={i} className="flex flex-col gap-0.5 rounded-md bg-secondary/40 px-2.5 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-medium text-foreground">{event.signal_name}</span>
                    <span className="text-[10px] text-muted-foreground/70">{formatRelativeTime(event.timestamp)}</span>
                  </div>
                  <span className="text-xs text-muted-foreground leading-snug">{event.summary}</span>
                  {projectId && (
                    <Link
                      href={`/project/${projectId}/traces/${event.trace_id}`}
                      className="text-[11px] text-primary hover:underline mt-0.5 w-fit"
                    >
                      View trace
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {projectId && (
        <Link href={`/project/${projectId}/signals`} className="text-xs text-primary hover:underline mt-0.5 w-fit">
          View all events
        </Link>
      )}
    </div>
  );
};

const NotificationPanel = () => {
  const { workspace, project } = useProjectContext();

  const { data: notifications } = useSWR<WebNotification[]>(
    workspace ? `/api/workspaces/${workspace.id}/notifications` : null,
    swrFetcher
  );

  const formattedNotifications = notifications
    ?.map((n) => ({
      notification: n,
      formatted: formatNotification(n, project?.id),
    }))
    .filter(
      (item): item is { notification: WebNotification; formatted: FormattedNotification } => item.formatted !== null
    );

  const hasNotifications = formattedNotifications && formattedNotifications.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex items-center justify-center rounded-md p-1",
            "text-secondary-foreground hover:bg-secondary/60 transition-colors"
          )}
        >
          <Bell className="size-4" />
          {hasNotifications && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" className="w-[28rem] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
        </div>
        <div className="max-h-[32rem] overflow-y-auto">
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
                />
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationPanel;
