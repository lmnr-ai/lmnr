"use client";
import { CircleAlert, X } from "lucide-react";
import React, { useCallback, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

import { SpanControls } from "@/components/traces/span-controls";
import { SpanViewTabs } from "@/components/traces/span-view";
import { SpanViewSkeleton } from "@/components/traces/span-view/skeleton";
import { SpanSearchProvider } from "@/components/traces/span-view/span-search-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { type Span } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

interface SpanViewProps {
  spanId: string;
  traceId: string;
  onClose?: () => void;
}

// Public counterpart of components/traces/span-view: same controls + tabs,
// fetched from the shared endpoint with project-scoped actions stripped.
export function SpanView({ spanId, traceId, onClose }: SpanViewProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const { data: span, isLoading, error } = useSWR<Span>(`/api/shared/traces/${traceId}/spans/${spanId}`, swrFetcher);

  const searchRef = useRef<HTMLInputElement>(null);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    searchRef.current?.focus();
  }, []);

  useHotkeys("meta+f", openSearch, { enableOnFormTags: ["input"], preventDefault: true });
  useHotkeys("esc", () => setSearchOpen(false), { enableOnFormTags: ["input"], preventDefault: true });

  // Stacked layouts hide the tree, so loading/error states need a way out too.
  const closeButton = onClose && (
    <div className="flex justify-end px-2 pt-2">
      <Button
        variant="ghost"
        size="icon-sm"
        className="hover:bg-surface-up"
        onClick={onClose}
        aria-label="Close span panel"
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {closeButton}
        <SpanViewSkeleton />
      </div>
    );
  }

  if (error || !span) {
    return (
      <div className="flex flex-col h-full w-full overflow-hidden">
        {closeButton}
        <div className="p-4">
          <Alert variant="destructive">
            <div className="flex items-start gap-4">
              <CircleAlert className="w-4 h-4" />
              <div className="flex-1 space-y-1">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error instanceof Error ? error.message : "Failed to load span"}</AlertDescription>
              </div>
            </div>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <SpanSearchProvider>
      <SpanControls span={span} onClose={onClose} isShared>
        <SpanViewTabs span={span} searchRef={searchRef} searchOpen={searchOpen} setSearchOpen={setSearchOpen} />
      </SpanControls>
    </SpanSearchProvider>
  );
}
