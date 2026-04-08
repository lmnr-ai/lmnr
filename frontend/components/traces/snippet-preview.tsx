import { type SnippetInfo } from "@/lib/actions/traces/search";
import { cn } from "@/lib/utils";

export interface SnippetPreviewProps {
  inputSnippet?: SnippetInfo;
  outputSnippet?: SnippetInfo;
  attributesSnippet?: SnippetInfo;
  snippetsCount?: number;
  className?: string;
  variant?: "table" | "span";
}

export function SnippetPreview({
  inputSnippet,
  outputSnippet,
  attributesSnippet,
  snippetsCount,
  className,
  variant = "table",
}: SnippetPreviewProps) {
  const snippet = inputSnippet ?? outputSnippet ?? attributesSnippet;
  if (!snippet) {
    return <span className="text-xs text-muted-foreground">No preview</span>;
  }

  const { text, highlight } = snippet;
  const [start, end] = highlight;
  const before = text.slice(0, start);
  const match = text.slice(start, end);
  const after = text.slice(end);
  const count = snippetsCount ?? 0;

  return (
    <span
      className={cn(
        "flex gap-1.5 min-w-0",
        variant === "table" ? "items-center" : "items-center justify-center",
        className
      )}
    >
      <span
        className={cn(
          "whitespace-normal break-words text-secondary-foreground",
          variant === "table" ? "text-xs line-clamp-2" : "text-[13px] line-clamp-3"
        )}
      >
        {before}
        <mark className="font-medium text-primary bg-primary/15 rounded px-0.5 min-w-0">{match}</mark>
        {after}
      </span>
      {count > 1 && (
        <span className="shrink-0 inline-flex items-center px-1.5 py-px text-[11px] font-medium text-primary bg-primary/10 rounded-full leading-normal whitespace-nowrap">
          +{count - 1}
        </span>
      )}
    </span>
  );
}
