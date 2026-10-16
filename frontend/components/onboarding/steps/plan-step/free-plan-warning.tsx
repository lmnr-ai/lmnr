import { Info } from "lucide-react";

interface FreePlanWarningProps {
  inviteCount: number;
  signalCount: number;
}

// Free has one seat and no Signals, so committing to it drops what the earlier steps queued.
export default function FreePlanWarning({ inviteCount, signalCount }: FreePlanWarningProps) {
  if (inviteCount === 0 && signalCount === 0) return null;

  const kept = [
    inviteCount > 0 ? `${inviteCount} ${inviteCount === 1 ? "teammate" : "teammates"}` : null,
    signalCount > 0 ? `${signalCount} ${signalCount === 1 ? "signal" : "signals"}` : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-2 px-1">
      <Info className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      <span className="text-[13px] text-muted-foreground">
        The Free plan includes one seat and no Signals. Start the free trial to keep your {kept.join(" and ")}.
      </span>
    </div>
  );
}
