"use client";

import { ChevronDown, ChevronUp, FileText, Layers } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { AlertContent } from "@/components/notifications/notification-panel/alert-content";
import { ClusterContent } from "@/components/notifications/notification-panel/cluster-content";
import { ReportContent } from "@/components/notifications/notification-panel/report-content";
import { SeverityIcon } from "@/components/notifications/notification-panel/severity-icon";
import { type FormattedNotification } from "@/components/notifications/notification-panel/utils";
import { type WebNotification } from "@/lib/actions/notifications";
import { cn, formatRelativeTime } from "@/lib/utils";

export const NotificationItem = ({
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
      {formatted.kind === "alert" && <AlertContent formatted={formatted} isUnread={isUnread} />}
      {formatted.kind === "cluster" && <ClusterContent formatted={formatted} isUnread={isUnread} />}
      {formatted.kind === "report" && <ReportContent formatted={formatted} projectId={projectId} />}
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
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {formatted.kind === "alert" ? (
            <SeverityIcon severity={formatted.severity} />
          ) : formatted.kind === "cluster" ? (
            <Layers className="size-3.5 shrink-0 text-muted-foreground/60" />
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground/60" />
          )}
          <span className={cn("text-xs truncate", isUnread ? "font-semibold" : "font-medium")}>{formatted.title}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          {isUnread && <span className="size-1.5 rounded-full bg-orange-500 shrink-0" />}
          <span className="text-[11px] text-muted-foreground/70">{formatRelativeTime(notification.createdAt)}</span>
        </div>
      </div>
      {!expanded ? (
        <div className="relative min-w-0">
          <div ref={contentRef} className="max-h-27 overflow-hidden flex flex-col gap-1.5 min-w-0">
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
        <div className="flex flex-col gap-1.5 min-w-0">
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
