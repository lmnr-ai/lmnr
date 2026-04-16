import { CollapsedTextWithMore } from "@/components/traces/trace-view/list/collapsed-text-with-more";
import { PreviewLoadingPlaceholder } from "@/components/traces/trace-view/preview-loading-placeholder.tsx";
import { Skeleton } from "@/components/ui/skeleton";

export type PreviewMap = Record<string, string | null | undefined>;

export function CollapsedPreviewBlock({
  text,
  isLoading,
  label,
  variant = "text",
}: {
  text: string | null;
  isLoading: boolean;
  label?: string;
  variant?: "text" | "collapsed";
}) {
  if (text) {
    if (variant === "collapsed") {
      return (
        <div className="flex flex-col min-w-0 pl-7 animate-in fade-in duration-150">
          {label && <span className="text-xs text-muted-foreground">{label}</span>}
          <CollapsedTextWithMore text={text} lineHeight={17} maxLines={2} />
        </div>
      );
    }
    return (
      <span className="text-[13px] text-secondary-foreground truncate min-w-0 pl-7 animate-in fade-in duration-150">
        {text}
      </span>
    );
  }

  if (isLoading) {
    if (variant === "collapsed") {
      return (
        <div className="pl-7">
          <PreviewLoadingPlaceholder />
        </div>
      );
    }
    return <Skeleton className="h-4 min-w-0 w-full bg-secondary ml-7 animate-in fade-in duration-150" />;
  }

  return null;
}
