import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { type ReportNotification } from "@/components/notifications/notification-panel/utils";
import { formatRelativeTime } from "@/lib/utils";

export const ReportContent = ({ formatted, projectId }: { formatted: ReportNotification; projectId?: string }) => (
  <>
    {formatted.aiSummary && (
      <div className="flex flex-col gap-1 mt-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Summary</span>
        <p className="text-xs text-secondary-foreground leading-relaxed break-words">{formatted.aiSummary}</p>
      </div>
    )}
    {formatted.noteworthyEvents.length > 0 && (
      <div className="flex flex-col gap-1.5 mt-1">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Noteworthy events</span>
        {formatted.noteworthyEvents.slice(0, 3).map((event, index) => (
          <div key={`${event.trace_id}-${index}`} className="flex flex-col gap-0.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-foreground">{event.signal_name}</span>
              <span className="text-[10px] text-muted-foreground/70">{formatRelativeTime(event.timestamp)}</span>
            </div>
            <span className="text-xs text-muted-foreground leading-snug break-words">{event.summary}</span>
            {projectId && (
              <Link
                href={`/project/${projectId}/traces/${event.trace_id}?chat=true`}
                className="inline-flex items-center gap-0.5 text-[11px] text-secondary-foreground hover:text-foreground mt-0.5 w-fit"
                onClick={(e) => e.stopPropagation()}
              >
                View trace
                <ArrowUpRight className="size-3 text-primary" />
              </Link>
            )}
          </div>
        ))}
      </div>
    )}
  </>
);
