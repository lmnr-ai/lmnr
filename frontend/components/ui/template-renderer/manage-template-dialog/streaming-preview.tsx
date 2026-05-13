import { Sparkles } from "lucide-react";

import { Skeleton } from "@/components/ui/skeleton";

interface StreamingPreviewProps {
  prompt?: string;
}

const StreamingPreview = ({ prompt }: StreamingPreviewProps) => (
  <div className="relative flex h-full w-full flex-col items-center justify-center gap-6 overflow-hidden bg-background">
    <div className="w-full max-w-md px-8" aria-hidden>
      <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card/40 p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Skeleton className="size-8" />
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-2.5 w-2/3" />
            <Skeleton className="h-2 w-1/3 opacity-70" />
          </div>
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>

        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-2 w-11/12" />
          <Skeleton className="h-2 w-3/4" />
        </div>

        <div className="grid grid-cols-3 gap-2 pt-1">
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
          <Skeleton className="h-12 rounded-lg" />
        </div>
      </div>
    </div>

    <div className="flex flex-col items-center gap-2 px-6 text-center">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <Sparkles className="size-3.5 text-primary" />
        <span>Designing your template…</span>
      </div>
      {prompt && (
        <span className="block max-w-sm truncate text-xs italic text-muted-foreground" title={prompt}>
          “{prompt}”
        </span>
      )}
    </div>
  </div>
);

export default StreamingPreview;
