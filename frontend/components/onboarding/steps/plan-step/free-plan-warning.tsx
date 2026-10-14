import { AlertTriangle } from "lucide-react";

interface FreePlanWarningProps {
  inviteCount: number;
  signalCount: number;
}

// Free has one seat and no Signals, so committing to it drops what the earlier steps queued.
export default function FreePlanWarning({ inviteCount, signalCount }: FreePlanWarningProps) {
  if (inviteCount === 0 && signalCount === 0) return null;

  const dropped = [
    inviteCount > 0 ? `${inviteCount} ${inviteCount === 1 ? "invite won't be sent" : "invites won't be sent"}` : null,
    signalCount > 0
      ? `${signalCount} ${signalCount === 1 ? "signal won't be set up" : "signals won't be set up"}`
      : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 px-4 py-3">
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-yellow-500" />
      <span className="text-sm text-secondary-foreground">
        The Free plan includes one seat and no Signals: your {dropped.join(" and your ")}. Start the free trial to keep
        them.
      </span>
    </div>
  );
}
