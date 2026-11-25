import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { type MetricAlertNotification } from "@/components/notifications/notification-panel/utils";
import { cn } from "@/lib/utils";

const LINK_CLASS = "inline-flex items-center gap-0.5 text-[11px] text-secondary-foreground hover:text-foreground w-fit";

export const MetricAlertContent = ({
  formatted,
  isUnread,
}: {
  formatted: MetricAlertNotification;
  isUnread: boolean;
}) => (
  <>
    <span
      className={cn(
        "text-xs leading-snug break-words min-w-0",
        isUnread ? "text-foreground/80" : "text-secondary-foreground"
      )}
    >
      {formatted.description}
    </span>
    <div className="flex gap-3">
      <Link href={formatted.tracesLink} className={LINK_CLASS} onClick={(e) => e.stopPropagation()}>
        Open traces
        <ArrowUpRight className="size-3 text-primary-text" />
      </Link>
      <Link href={formatted.alertLink} className={LINK_CLASS} onClick={(e) => e.stopPropagation()}>
        Open alert
        <ArrowUpRight className="size-3 text-primary-text" />
      </Link>
    </div>
  </>
);
