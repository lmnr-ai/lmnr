import Link from "next/link";

import { ReportChange } from "@/components/notifications/notification-panel/report-change";
import { type ReportSignal } from "@/components/notifications/notification-panel/utils";

const pluralizeEvents = (count: number) => `${count} event${count !== 1 ? "s" : ""}`;

export const ReportSignalCard = ({ signal }: { signal: ReportSignal }) => (
  <div className="flex flex-col gap-1 min-w-0">
    <div className="flex items-center gap-1.5 min-w-0">
      {signal.link ? (
        <Link
          href={signal.link}
          className="text-xs font-medium text-foreground hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          {signal.name}
        </Link>
      ) : (
        <span className="text-xs font-medium text-foreground truncate">{signal.name}</span>
      )}
      <span className="text-[11px] text-muted-foreground shrink-0">{pluralizeEvents(signal.count)}</span>
      {signal.previousCount !== null && (
        <span className="shrink-0">
          <ReportChange current={signal.count} previous={signal.previousCount} />
        </span>
      )}
    </div>
    {signal.summary && (
      <p className="text-xs text-secondary-foreground leading-relaxed break-words">{signal.summary}</p>
    )}
    {signal.clusters.length > 0 && (
      <div className="flex flex-col gap-0.5 mt-0.5">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Notable clusters</span>
        {signal.clusters.map((cluster) => (
          <div key={cluster.link} className="flex items-center gap-1.5 text-xs leading-snug min-w-0">
            <Link
              href={cluster.link}
              className="text-secondary-foreground hover:text-foreground hover:underline truncate"
              onClick={(e) => e.stopPropagation()}
            >
              {cluster.name}
            </Link>
            <span className="text-[11px] text-muted-foreground shrink-0">· {pluralizeEvents(cluster.count)} ·</span>
            <span className="shrink-0">
              <ReportChange current={cluster.count} previous={cluster.previousCount} />
            </span>
          </div>
        ))}
      </div>
    )}
  </div>
);
