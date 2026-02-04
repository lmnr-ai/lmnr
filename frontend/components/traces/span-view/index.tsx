import { get, omit } from "lodash";
import { CircleAlert } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import useSWR from "swr";

import { SpanControls } from "@/components/traces/span-controls";
import SpanViewSearchBar from "@/components/traces/span-view/search-bar.tsx";
import SpanContent from "@/components/traces/span-view/span-content";
import { SpanSearchProvider, useSpanSearchContext } from "@/components/traces/span-view/span-search-context";
import { SpanViewStateProvider } from "@/components/traces/span-view/span-view-store";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Skeleton } from "@/components/ui/skeleton";
import { type Event } from "@/lib/events/types";
import { type Span } from "@/lib/traces/types";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";

interface SpanViewProps {
  spanId: string;
  traceId: string;
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
  cleanedEvents,
  searchRef,
  searchOpen,
  setSearchOpen,
}: {
  span: Span;
  cleanedEvents: any;
  searchRef: React.RefObject<HTMLInputElement | null>;
  searchOpen: boolean;
  setSearchOpen: (open: boolean) => void;
}) => {
  const searchContext = useSpanSearchContext();

  return (
    <Tabs className="flex flex-col grow overflow-hidden gap-0" defaultValue="span-input" tabIndex={0}>
      <div className="px-2 pb-2 mt-2 border-b w-full">
        <TabsList className="border-none text-xs h-7">
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
            searchTerm={searchContext?.searchTerm || ""}
          />
        </TabsContent>
        <TabsContent value="events" className="w-full h-full">
          <ContentRenderer
            className="rounded-none border-0"
            codeEditorClassName="rounded-none border-none bg-background contain-strict"
            readOnly
            value={JSON.stringify(cleanedEvents)}
            defaultMode="yaml"
            searchTerm={searchContext?.searchTerm || ""}
          />
        </TabsContent>
      </div>
    </Tabs>
  );
};

export function SpanView({ spanId, traceId }: SpanViewProps) {
  const { projectId } = useParams();
  const [searchOpen, setSearchOpen] = useState(false);
  const {
    data: span,
    isLoading,
    error,
  } = useSWR<Span>(`/api/projects/${projectId}/traces/${traceId}/spans/${spanId}`, swrFetcher);
  const { data: events } = useSWR<Event[]>(
    `/api/projects/${projectId}/traces/${traceId}/spans/${spanId}/events`,
    swrFetcher
  );

  const cleanedEvents = useMemo(() => events?.map((event) => omit(event, ["spanId", "projectId"])), [events]);
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
    return (
      <div className="flex flex-col space-y-2 p-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
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
      <SpanViewStateProvider>
        <SpanSearchProvider>
          <SpanControls events={cleanedEvents} span={span}>
            <SpanViewTabs
              span={span}
              cleanedEvents={cleanedEvents}
              searchRef={searchRef}
              searchOpen={searchOpen}
              setSearchOpen={setSearchOpen}
            />
          </SpanControls>
        </SpanSearchProvider>
      </SpanViewStateProvider>
    );
  }
} 