import { CircleAlert, Cloud, CloudOff, Loader2 } from "lucide-react";

import { type SaveStatus } from "@/components/sql/sql-editor-store";
import { cn } from "@/lib/utils";

const STATUS = {
  saved: { label: "Saved", icon: Cloud, className: "text-muted-foreground" },
  saving: { label: "Saving", icon: Loader2, className: "text-muted-foreground" },
  unsaved: { label: "Unsaved", icon: CloudOff, className: "text-muted-foreground" },
  error: { label: "Not saved", icon: CircleAlert, className: "text-destructive" },
} as const satisfies Record<SaveStatus, { label: string; icon: typeof Cloud; className: string }>;

/** Autosave state of the query in the editor — the only feedback that a keystroke reached the server. */
const SaveStatusIndicator = ({ status }: { status: SaveStatus }) => {
  const { label, icon: Icon, className } = STATUS[status];

  return (
    <span className={cn("flex shrink-0 items-center gap-1 text-xs", className)}>
      <Icon className={cn("size-3", status === "saving" && "animate-spin")} />
      {label}
    </span>
  );
};

export default SaveStatusIndicator;
