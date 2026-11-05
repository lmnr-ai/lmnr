import { ReportSignalCard } from "@/components/notifications/notification-panel/report-signal";
import { type ReportNotification } from "@/components/notifications/notification-panel/utils";

export const ReportContent = ({ formatted }: { formatted: ReportNotification }) => (
  <div className="flex flex-col gap-3 mt-1">
    {formatted.signals.map((signal) => (
      <ReportSignalCard key={signal.link ?? signal.name} signal={signal} />
    ))}
  </div>
);
