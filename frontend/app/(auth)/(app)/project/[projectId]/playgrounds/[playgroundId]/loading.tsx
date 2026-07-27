import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div
      className="flex h-full w-full items-center justify-center py-16"
      role="status"
      aria-label="Loading playground"
    >
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
