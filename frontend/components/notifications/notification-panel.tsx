"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useProjectContext } from "@/contexts/project-context";
import { type WebNotification } from "@/lib/actions/notifications";
import { cn, swrFetcher } from "@/lib/utils";

interface ReportPayload {
  title: string;
  report: {
    workspace_id: string;
    workspace_name: string;
    period_label: string;
    period_start: string;
    period_end: string;
    total_events: number;
    projects: {
      project_name: string;
      project_id: string;
      signal_event_counts: Record<string, number>;
      ai_summary: string;
      noteworthy_events: {
        signal_name: string;
        summary: string;
        timestamp: string;
        trace_id: string;
      }[];
    }[];
  };
}

const formatNotification = (notification: WebNotification, projectId?: string) => {
  try {
    const payload: ReportPayload = JSON.parse(notification.payload);
    const report = payload.report;
    const project = projectId ? report.projects.find((p) => p.project_id === projectId) : undefined;

    // If a projectId was provided but not found in the report, this project had
    // no events in the period — skip showing this notification.
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

    return {
      title: `Events Summary (${report.period_start} - ${report.period_end})`,
      summary: `${events} new event${events !== 1 ? "s" : ""} among ${signalCount} signal${signalCount !== 1 ? "s" : ""} during last ${periodType}`,
    };
  } catch {
    return null;
  }
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
      (
        item
      ): item is { notification: WebNotification; formatted: NonNullable<ReturnType<typeof formatNotification>> } =>
        item.formatted !== null
    );

  const hasNotifications = formattedNotifications && formattedNotifications.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex items-center justify-center rounded-md p-1.5",
            "text-secondary-foreground hover:bg-secondary/60 transition-colors"
          )}
        >
          <Bell className="size-6" />
          {hasNotifications && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {!hasNotifications ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              No notifications yet
            </div>
          ) : (
            <div className="flex flex-col">
              {formattedNotifications.map(({ notification, formatted }) => (
                <div key={notification.id} className="flex flex-col gap-1 border-b last:border-b-0 px-3 py-2.5">
                  <span className="text-xs font-medium text-foreground">{formatted.title}</span>
                  <span className="text-xs text-muted-foreground">{formatted.summary}</span>
                  <span className="text-[11px] text-muted-foreground/70">
                    {new Date(notification.createdAt).toLocaleString()}
                  </span>
                  {project && (
                    <Link
                      href={`/project/${project.id}/signals`}
                      className="text-xs text-primary hover:underline mt-0.5 w-fit"
                    >
                      View events
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationPanel;
