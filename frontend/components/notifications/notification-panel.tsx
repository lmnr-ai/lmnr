"use client";

import { Bell } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
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

const formatNotification = (notification: WebNotification) => {
  try {
    const payload: ReportPayload = JSON.parse(notification.payload);
    const report = payload.report;
    const signalCount = report.projects.reduce((acc, p) => acc + Object.keys(p.signal_event_counts).length, 0);
    const periodType = report.period_label?.toLowerCase().includes("week") ? "week" : "day";

    return {
      title: payload.title,
      summary: `${report.total_events} new event${report.total_events !== 1 ? "s" : ""} among ${signalCount} signal${signalCount !== 1 ? "s" : ""} during last ${periodType}`,
      period: `${report.period_start} - ${report.period_end}`,
      projectCount: report.projects.length,
    };
  } catch {
    return {
      title: "Report",
      summary: "New signal events report available",
      period: "",
      projectCount: 0,
    };
  }
};

const NotificationPanel = () => {
  const { workspace } = useProjectContext();
  const { projectId } = useParams<{ projectId: string }>();

  const { data: notifications } = useSWR<WebNotification[]>(
    workspace ? `/api/workspaces/${workspace.id}/notifications` : null,
    swrFetcher
  );

  const hasNotifications = notifications && notifications.length > 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "relative flex items-center justify-center rounded-md p-1.5",
            "text-secondary-foreground hover:bg-secondary/60 transition-colors"
          )}
        >
          <Bell className="size-4" />
          {hasNotifications && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-primary" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
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
              {notifications.map((n) => {
                const formatted = formatNotification(n);
                return (
                  <div key={n.id} className="flex flex-col gap-1 border-b last:border-b-0 px-3 py-2.5">
                    <span className="text-xs font-medium text-foreground">{formatted.title}</span>
                    <span className="text-xs text-muted-foreground">{formatted.summary}</span>
                    {formatted.period && (
                      <span className="text-[11px] text-muted-foreground/70">{formatted.period}</span>
                    )}
                    <Link
                      href={`/project/${projectId}/signals`}
                      className="text-xs text-primary hover:underline mt-0.5 w-fit"
                    >
                      View events
                    </Link>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationPanel;
