import { get } from "lodash";
import { CircleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

import { SpanControls } from "@/components/traces/span-controls";
import SpanViewSearchBar from "@/components/traces/span-view/search-bar.tsx";
import SpanContent from "@/components/traces/span-view/span-content";
import SpanOverview from "@/components/traces/span-view/span-overview";
import { SpanSearchProvider } from "@/components/traces/span-view/span-search-context";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { spanViewTheme } from "@/components/ui/content-renderer/utils";
import { type Span, SpanType } from "@/lib/traces/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { SpanViewSkeleton } from "./skeleton";

export type SpanViewTab = "overview" | "span-input" | "span-output" | "attributes" | "events";

interface SpanViewProps {
  spanId: string;
  traceId: string;
  initialSearchTerm?: string;
  initialTab?: SpanViewTab;
  onClose?: () => void;
  isAlwaysSelectSpan?: boolean;
}

const swrFetcher = async (url: string) => {
  const res = await fetch(url);

  if (!res.ok) {
    const errorText = (await res.json()) as { error: string };

    throw new Error(errorText.error);
  }

  return res.json();
};

// Inner component that has access to SpanSearchContext
const SpanViewTabs = ({
  span,
  searchRef,
  searchOpen,
  setSearchOpen,
  initialTab,
}: {
  span: Span;
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
  initialTab?: SpanViewTab;
}) => {
  const isLLM = span.spanType === SpanType.LLM;
  const defaultTab = initialTab ?? (isLLM ? "overview" : "span-input");

  return (
    <Tabs key={initialTab} className="flex flex-col grow overflow-hidden gap-0" defaultValue={defaultTab} tabIndex={0}>
      <div className="px-2 pb-2 mt-2 border-b w-full">
        <TabsList className="border-none text-xs h-7">
          {isLLM && (
            <TabsTrigger value="overview" className="text-xs">
              Overview
            </TabsTrigger>
          )}
          <TabsTrigger value="span-input" className="text-xs">
            Span Input
          </TabsTrigger>
          <TabsTrigger value="span-output" className="text-xs">
            Span Output
          </TabsTrigger>
          <TabsTrigger value="attributes" className="text-xs">
            Attributes
          </TabsTrigger>
          <TabsTrigger value="events" className="text-xs">
            Events
          </TabsTrigger>
        </TabsList>
      </div>
      <SpanViewSearchBar ref={searchRef} open={searchOpen} setOpen={setSearchOpen} />
      <div className="grow flex overflow-hidden">
        {isLLM && (
          <TabsContent value="overview" className="w-full h-full">
            <SpanOverview span={span} />
          </TabsContent>
        )}
        <TabsContent value="span-input" className="w-full h-full">
          <SpanContent span={span} type="input" />
        </TabsContent>
        <TabsContent value="span-output" className="w-full h-full">
          <SpanContent span={span} type="output" />
        </TabsContent>
        <TabsContent value="attributes" className="w-full h-full">
          <ContentRenderer
            className="rounded-none border-0"
            codeEditorClassName="rounded-none border-none bg-background contain-strict"
            readOnly
            value={JSON.stringify(span.attributes)}
            defaultMode="yaml"
            customTheme={spanViewTheme}
          />
        </TabsContent>
        <TabsContent value="events" className="w-full h-full">
          <ContentRenderer
            className="rounded-none border-0"
            codeEditorClassName="rounded-none border-none bg-background contain-strict"
            readOnly
            value={JSON.stringify(span.events)}
            defaultMode="yaml"
            customTheme={spanViewTheme}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export function SpanView({
  spanId,
  traceId,
  initialSearchTerm,
  initialTab,
  onClose,
  isAlwaysSelectSpan,
}: SpanViewProps) {
  const { projectId } = useParams();
  const [searchOpen, setSearchOpen] = useState(!!initialSearchTerm);
  const {
    data: span,
    isLoading,
    error,
  } = useSWR<Span>(`/api/projects/${projectId}/traces/${traceId}/spans/${spanId}`, swrFetcher);

  const searchRef = useRef<HTMLInputElement>(null);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    searchRef?.current?.focus();
  }, []);

  useHotkeys("meta+f", openSearch, {
    enableOnFormTags: ["input"],
    preventDefault: true,
  });

  useHotkeys("esc", () => setSearchOpen(false), {
    enableOnFormTags: ["input"],
    preventDefault: true,
  });

  if (isLoading) {
    return <SpanViewSkeleton />;
  }

  if (error) {
    return (
      <div className="p-4">
        <Alert variant="destructive">
          <div className="flex items-start gap-4">
            <CircleAlert className="w-4 h-4" />
            <div className="flex-1 space-y-1">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>
                {error instanceof Error ? error.message : JSON.stringify(error, null, 2)}
              </AlertDescription>
            </div>
          </div>
        </Alert>
      </div>
    );
  }

  if (span && get(span.attributes, "gen_ai.prompt.user")) {
    return (
      <div className="whitespace-pre-wrap p-4 border rounded-md bg-muted/50">
        {get(span.attributes, "gen_ai.prompt.user")}
      </div>
    );
  }

  if (span) {
    return (
      <SpanSearchProvider initialSearchTerm={initialSearchTerm}>
        <SpanControls span={span} onClose={onClose} isAlwaysSelectSpan={isAlwaysSelectSpan}>
          <SpanViewTabs
            span={span}
            searchRef={searchRef}
            searchOpen={searchOpen}
            setSearchOpen={setSearchOpen}
            initialTab={initialTab}
          />
        </SpanControls>
      </SpanSearchProvider>
    );
  }
}
