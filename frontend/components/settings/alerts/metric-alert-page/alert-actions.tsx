import { addHours } from "date-fns";
import { BellOff, BellRing, Clock, ExternalLink, Pen } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type MetricAlert } from "@/lib/actions/alerts/metric-rule";

import { isSnoozed } from "../metric-alerts/utils";

const SNOOZE_HOURS = [
  { label: "1 hour", hours: 1 },
  { label: "4 hours", hours: 4 },
  { label: "1 day", hours: 24 },
  { label: "1 week", hours: 24 * 7 },
];

interface AlertActionsProps {
  alert: MetricAlert;
  /** `null` while the range of the open incident is not known. */
  tracesHref: string | null;
  isPending: boolean;
  onSnooze: (until: Date | null) => void;
  onMute: (muted: boolean) => void;
  onEdit: () => void;
}

export default function AlertActions({ alert, tracesHref, isPending, onSnooze, onMute, onEdit }: AlertActionsProps) {
  const muted = !!alert.rule.disabled;
  const snoozed = isSnoozed(alert.rule);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button asChild={!!tracesHref} variant="outline" className="gap-2" disabled={!tracesHref}>
        {tracesHref ? (
          <Link href={tracesHref}>
            <ExternalLink className="size-3.5" />
            Open traces
          </Link>
        ) : (
          <>
            <ExternalLink className="size-3.5" />
            Open traces
          </>
        )}
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2" disabled={isPending}>
            <Clock className="size-3.5" />
            {snoozed ? "Snoozed" : "Snooze"}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          {SNOOZE_HOURS.map((option) => (
            <DropdownMenuItem
              key={option.hours}
              className="cursor-pointer"
              onClick={() => onSnooze(addHours(new Date(), option.hours))}
            >
              For {option.label}
            </DropdownMenuItem>
          ))}
          {snoozed && (
            <DropdownMenuItem className="cursor-pointer" onClick={() => onSnooze(null)}>
              End snooze
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" className="gap-2" disabled={isPending} onClick={() => onMute(!muted)}>
        {muted ? <BellRing className="size-3.5" /> : <BellOff className="size-3.5" />}
        {muted ? "Unmute" : "Mute"}
      </Button>
      <Button variant="outline" className="gap-2" onClick={onEdit}>
        <Pen className="size-3.5" />
        Edit
      </Button>
    </div>
  );
}
