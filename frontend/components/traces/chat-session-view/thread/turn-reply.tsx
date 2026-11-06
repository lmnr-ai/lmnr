import { CircleAlert } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

import { type TurnReply as Reply } from "../live-session/sync";
import CollapsibleReply from "./collapsible-reply";

const Note = ({ alert, children }: { alert?: boolean; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 text-xs text-muted-foreground">
    {alert && <CircleAlert className="size-4 text-destructive-text" />}
    {children}
  </div>
);

/** The assistant side of a turn. `turnFailed`: the turn itself ended with an error. */
export default function TurnReply({
  reply,
  turnFailed,
  onRetry,
}: {
  reply: Reply;
  turnFailed: boolean;
  onRetry: () => void;
}) {
  switch (reply.status) {
    case "text":
      return <CollapsibleReply text={reply.text} />;
    case "loading":
    case "writing":
      return (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      );
    case "failed":
      return (
        <Note alert>
          Couldn't load the reply.
          <Button variant="link" size="sm" className="h-auto p-0" onClick={onRetry}>
            Retry
          </Button>
        </Note>
      );
    case "none":
      return turnFailed ? (
        <Note alert>The agent didn't reply — the turn ended with an error.</Note>
      ) : (
        <Note>No reply extracted.</Note>
      );
  }
}
