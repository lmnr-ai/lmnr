import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <div className="flex h-screen w-full items-center justify-center" role="status" aria-label="Loading trace">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
