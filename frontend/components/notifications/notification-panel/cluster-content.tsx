import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { type NewClusterNotification } from "@/components/notifications/notification-panel/utils";
import { cn } from "@/lib/utils";

export const ClusterContent = ({ formatted, isUnread }: { formatted: NewClusterNotification; isUnread: boolean }) => (
  <>
    {formatted.details.length > 0 && (
      <div className="flex flex-col gap-0.5">
        {formatted.details.map(([key, value]) => (
          <div key={key} className="flex gap-1.5 text-xs leading-snug">
            <span className="text-muted-foreground shrink-0">{key}:</span>
            <span className={cn("break-words", isUnread ? "text-foreground/80" : "text-secondary-foreground")}>
              {value}
            </span>
          </div>
        ))}
      </div>
    )}
    <div className="flex gap-3">
      <Link
        href={formatted.clusterLink}
        className="inline-flex items-center gap-0.5 text-[11px] text-secondary-foreground hover:text-foreground w-fit"
        onClick={(e) => e.stopPropagation()}
      >
        View cluster
        <ArrowUpRight className="size-3 text-primary" />
      </Link>
    </div>
  </>
);
