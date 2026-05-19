import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { LinkText } from "@/components/notifications/notification-panel/link-text";
import { type NewEventNotification } from "@/components/notifications/notification-panel/utils";
import { cn } from "@/lib/utils";

export const AlertContent = ({ formatted, isUnread }: { formatted: NewEventNotification; isUnread: boolean }) => (
  <>
    {formatted.extractedFields.length > 0 && (
      <div className="flex flex-col gap-1.5">
        {formatted.extractedFields.map(([key, value]) => (
          <div key={key} className="flex flex-col">
            <span className="text-[11px] font-medium text-muted-foreground">{key}</span>
            <span
              className={cn(
                "text-xs leading-snug break-words min-w-0",
                isUnread ? "text-foreground/80" : "text-secondary-foreground"
              )}
            >
              <LinkText text={value} />
            </span>
          </div>
        ))}
      </div>
    )}
    <div className="flex flex-col gap-1">
      <Link
        href={formatted.traceLink}
        className="inline-flex items-center gap-0.5 text-[11px] text-secondary-foreground hover:text-foreground w-fit"
        onClick={(e) => e.stopPropagation()}
      >
        View trace
        <ArrowUpRight className="size-3 text-primary" />
      </Link>
      {formatted.similarEventsLink && (
        <Link
          href={formatted.similarEventsLink}
          className="inline-flex items-center gap-0.5 text-[11px] text-secondary-foreground hover:text-foreground w-fit"
          onClick={(e) => e.stopPropagation()}
        >
          View similar events
          <ArrowUpRight className="size-3 text-primary" />
        </Link>
      )}
    </div>
  </>
);
