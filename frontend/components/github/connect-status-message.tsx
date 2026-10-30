import { type GithubConnectStatus } from "@/lib/actions/github/types";
import { cn } from "@/lib/utils";

const MESSAGES: Record<Exclude<GithubConnectStatus, "connected">, string> = {
  pending: "Waiting for your GitHub org owner to approve. Click Connect again after they approve.",
  taken: "This GitHub account is already connected to another Laminar workspace.",
  error: "Failed to connect GitHub. Please try again.",
};

export default function ConnectStatusMessage({
  status,
  className,
}: {
  status: GithubConnectStatus | null;
  className?: string;
}) {
  if (!status || status === "connected") return null;
  return (
    <p className={cn("text-xs", status === "pending" ? "text-muted-foreground" : "text-destructive-text", className)}>
      {MESSAGES[status]}
    </p>
  );
}
