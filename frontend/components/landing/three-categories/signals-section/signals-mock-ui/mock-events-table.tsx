import { cn } from "@/lib/utils";

import { type MockEvent } from "./mock-data";

interface Props {
  events: MockEvent[];
  className?: string;
}

const formatMinutesAgo = (m: number): string => {
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
};

const SeverityBadge = ({ severity }: { severity: MockEvent["severity"] }) => {
  const isCritical = severity === "critical";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        isCritical
          ? "border-red-500/40 text-red-400 bg-red-500/10"
          : "border-amber-500/40 text-amber-400 bg-amber-500/10"
      )}
    >
      {isCritical ? "Critical" : "Warning"}
    </span>
  );
};

const MockEventsTable = ({ events, className }: Props) => (
  <div className={cn("flex flex-col w-full overflow-hidden bg-secondary border rounded-md", className)}>
    <div className="flex border-b shrink-0 text-xs text-muted-foreground">
      <div className="w-[136px] shrink-0 pl-4 pr-2 py-1.5">Timestamp</div>
      <div className="w-[140px] shrink-0 px-2 py-1.5">Trace ID</div>
      <div className="w-[120px] shrink-0 px-2 py-1.5">Severity</div>
      <div className="flex-1 min-w-0 px-2 py-1.5">Description</div>
      <div className="w-[140px] shrink-0 pl-2 pr-4 py-1.5">Category</div>
    </div>
    <div className="flex-1 min-h-0 overflow-y-auto">
      {events.map((event) => (
        <div key={event.id} className="flex border-b last:border-b-0 hover:bg-muted/40 transition-colors text-sm">
          <div className="w-[136px] shrink-0 pl-4 pr-2 py-2 text-secondary-foreground">
            {formatMinutesAgo(event.minutesAgo)}
          </div>
          <div className="w-[140px] shrink-0 px-2 py-2 min-w-0">
            <span className="block font-mono text-xs truncate text-secondary-foreground">{event.traceId}</span>
          </div>
          <div className="w-[120px] shrink-0 px-2 py-2">
            <SeverityBadge severity={event.severity} />
          </div>
          <div className="flex-1 min-w-0 px-2 py-2 text-secondary-foreground line-clamp-3 whitespace-normal break-words">
            {event.description}
          </div>
          <div className="w-[140px] shrink-0 pl-2 pr-4 py-2 text-secondary-foreground font-mono text-xs leading-5">
            {event.category}
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default MockEventsTable;
