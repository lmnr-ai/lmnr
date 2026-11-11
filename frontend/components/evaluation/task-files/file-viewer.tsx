import { Download } from "lucide-react";

import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter";
import { Skeleton } from "@/components/ui/skeleton";

import { PREVIEW_BYTES, useFileContent } from "./use-file-content";
import { formatBytes, languageOf } from "./utils";

/** Prism gets slow past this; bigger previews render as plain text. */
const HIGHLIGHT_MAX_CHARS = 200_000;

interface FileViewerProps {
  url: string;
  /** Relative to the tree's root. */
  path: string;
  size: number;
}

export default function FileViewer({ url, path, size }: FileViewerProps) {
  const { content, error, isLoading } = useFileContent(url, size);

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex flex-none items-center justify-between gap-2 border-b px-3 py-1.5">
        <span className="truncate font-mono text-xs" title={path}>
          {path}
        </span>
        <div className="flex flex-none items-center gap-2">
          <span className="text-xs text-muted-foreground">{formatBytes(size)}</span>
          <Button variant="ghost" size="icon" asChild title="Download">
            <a href={url} download>
              <Download className="size-3.5" />
            </a>
          </Button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto p-3">
        {isLoading && (
          <div className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {content?.binary && <p className="text-sm text-muted-foreground">Binary file. Download it to view.</p>}
        {content && !content.binary && (
          <>
            {content.truncated && (
              <p className="mb-2 text-xs text-muted-foreground">
                Showing the first {formatBytes(PREVIEW_BYTES)} of {formatBytes(size)}. Download the file to see all of
                it.
              </p>
            )}
            {content.text.length > HIGHLIGHT_MAX_CHARS ? (
              <pre className="whitespace-pre-wrap break-all font-mono text-xs">{content.text}</pre>
            ) : (
              // `!` beats CodeHighlighter's inline 0.9rem, matching the span input/output size.
              <CodeHighlighter code={content.text} language={languageOf(path)} className="[&_pre]:text-xs!" copyable />
            )}
          </>
        )}
      </div>
    </div>
  );
}
