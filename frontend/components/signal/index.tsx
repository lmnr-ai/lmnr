"use client";

import { format, formatRelative } from "date-fns";
import { History, Network } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, type ResizeCallback } from "re-resizable";
import React, { useCallback, useEffect, useRef, useState } from "react";

import ClustersTable from "@/components/signal/clusters-table";
import DisableClusteringDialog from "@/components/signal/disable-clustering-dialog.tsx";
import EventsTable from "@/components/signal/events-table";
import SignalJobsTable from "@/components/signal/jobs-table";
import StartClusteringDialog from "@/components/signal/start-clustering-dialog.tsx";
import { useEventsStoreContext } from "@/components/signal/store.tsx";
import { type EventNavigationItem, getEventsConfig } from "@/components/signal/utils";
import { type ManageEventDefinitionForm } from "@/components/signals/manage-event-definition-sheet";
import TraceView from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import { filterColumns, getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { cn } from "@/lib/utils";

const ManageEventDefinitionSheet = dynamic(
  () => import("@/components/signals/manage-event-definition-sheet.tsx").then((mod) => mod.default),
  { ssr: false }
);

function SignalContent() {
  const pathName = usePathname();
  const params = useParams<{ projectId: string }>();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const ref = useRef<Resizable>(null);
  const { workspace } = useProjectContext();

  const activeTab = searchParams.get("tab") || "events";

  const {
    eventDefinition,
    setEventDefinition,
    traceId,
    spanId,
    setTraceId,
    setSpanId,
    clusterConfig,
    isSemanticEventsEnabled,
    initialTraceViewWidth,
    lastEvent,
  } = useEventsStoreContext((state) => ({
    eventDefinition: state.eventDefinition,
    setEventDefinition: state.setEventDefinition,
    traceId: state.traceId,
    spanId: state.spanId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
    clusterConfig: state.clusterConfig,
    isSemanticEventsEnabled: state.isSignalsEnabled,
    initialTraceViewWidth: state.initialTraceViewWidth,
    lastEvent: state.lastEvent,
  }));

  const [defaultTraceViewWidth, setDefaultTraceViewWidth] = React.useState(initialTraceViewWidth || 1000);
  const isFreeTier = workspace?.tierName.toLowerCase().trim() === "free";

  useEffect(() => {
    if (!initialTraceViewWidth) {
      setDefaultTraceViewWidth(getDefaultTraceViewWidth());
    }
  }, [initialTraceViewWidth]);

  const handleSuccess = useCallback(
    async (form: ManageEventDefinitionForm) => {
      setEventDefinition({
        ...eventDefinition,
        prompt: form.prompt,
        structuredOutput: form.structuredOutput,
        triggerSpans: form.triggerSpans,
      });
    },
    [eventDefinition, setEventDefinition]
  );

  const handleTabChange = useCallback(
    (tab: string) => {
      const params = new URLSearchParams(searchParams);
      params.set("tab", tab);
      push(`${pathName}?${params.toString()}`);
    },
    [pathName, push, searchParams]
  );

  const handleResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    const newWidth = defaultTraceViewWidth + delta.width;
    setDefaultTraceViewWidth(newWidth);
    setEventsTraceViewWidthCookie(newWidth).catch((e) => console.warn(`Failed to save value to cookies. ${e}`));
  };

  useEffect(() => {
    if (typeof window !== "undefined") {
      if (defaultTraceViewWidth > window.innerWidth - 180) {
        const newWidth = window.innerWidth - 240;
        setDefaultTraceViewWidth(newWidth);
        setEventsTraceViewWidthCookie(newWidth);
        ref?.current?.updateSize({ width: newWidth });
      }
    }
  }, [defaultTraceViewWidth]);

  return (
    <>
      <div className="flex flex-col gap-4 flex-1 px-4 pb-4 overflow-auto">
        {isSemanticEventsEnabled && (
          <>
            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col gap-4">
              <div className="flex items-center gap-4">
                <TabsList className="h-8">
                  <TabsTrigger className="text-xs" value="events">
                    Events
                  </TabsTrigger>
                  <TabsTrigger className="text-xs" value="jobs">
                    Jobs
                  </TabsTrigger>
                </TabsList>
                {!isFreeTier && (
                  <ManageEventDefinitionSheet
                    open={isDialogOpen}
                    setOpen={setIsDialogOpen}
                    defaultValues={eventDefinition}
                    key={eventDefinition.id}
                    onSuccess={handleSuccess}
                  >
                    <Button icon="edit" variant="secondary">
                      Edit Signal
                    </Button>
                  </ManageEventDefinitionSheet>
                )}
              </div>

              <TabsContent value="events" className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <div className="flex gap-4">
                    <span className="text-lg font-semibold">Clusters</span>
                    {clusterConfig ? (
                      <DisableClusteringDialog eventName={eventDefinition.name}>
                        <Button variant="secondary">
                          <Network className="mr-1 size-3.5" />
                          Disable Clustering
                        </Button>
                      </DisableClusteringDialog>
                    ) : (
                      <StartClusteringDialog eventName={eventDefinition.name}>
                        <Button variant="secondary" className="w-fit">
                          <Network className="mr-1 size-3.5" />
                          Start Clustering
                        </Button>
                      </StartClusteringDialog>
                    )}
                  </div>

                  {eventDefinition.id && (
                    <ClustersTable
                      projectId={eventDefinition.projectId}
                      eventDefinitionId={eventDefinition.id}
                      eventDefinitionName={eventDefinition.name}
                    />
                  )}
                </div>

                <div className="flex flex-col gap-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-lg font-semibold">Events</span>
                    <span className="text-xs text-muted-foreground font-medium">
                      Last event:{" "}
                      <span
                        title={lastEvent?.timestamp ? format(lastEvent?.timestamp, "PPpp") : "-"}
                        className={cn("text-xs", {
                          "text-foreground": lastEvent,
                        })}
                      >
                        {lastEvent ? formatRelative(new Date(lastEvent.timestamp), new Date()) : "-"}
                      </span>
                    </span>
                  </div>
                  <EventsTable
                    projectId={eventDefinition.projectId}
                    eventName={eventDefinition.name}
                    eventDefinitionId={eventDefinition.id}
                  />
                </div>
              </TabsContent>

              <TabsContent value="jobs" className="flex flex-col gap-2">
                <div className="flex items-center gap-4">
                  <span className="text-lg font-semibold">Jobs</span>
                  {eventDefinition.id && (
                    <Link href="/" passHref>
                      <Button variant="secondary">
                        <History className="mr-1 size-3.5" />
                        Create Job
                      </Button>
                    </Link>
                  )}
                </div>

                {eventDefinition.id && (
                  <SignalJobsTable projectId={eventDefinition.projectId} eventDefinitionId={eventDefinition.id} />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-[60] flex pointer-events-auto">
          <Resizable
            ref={ref}
            onResizeStop={handleResizeStop}
            enable={{
              left: true,
            }}
            defaultSize={{
              width: defaultTraceViewWidth,
            }}
          >
            <FiltersContextProvider columns={filterColumns}>
              <TraceView
                spanId={spanId || undefined}
                key={traceId}
                onClose={() => {
                  const params = new URLSearchParams(searchParams);
                  params.delete("traceId");
                  params.delete("spanId");
                  push(`${pathName}?${params.toString()}`);
                  setTraceId(null);
                  setSpanId(null);
                }}
                traceId={traceId}
              />
            </FiltersContextProvider>
          </Resizable>
        </div>
      )}
    </>
  );
}

export default function Signal({ spanId, traceId }: { spanId?: string; traceId?: string }) {
  const { setTraceId, setSpanId } = useEventsStoreContext((state) => ({
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

  const handleNavigate = useCallback(
    (item: EventNavigationItem | null) => {
      if (item) {
        setTraceId(item.traceId);
        setSpanId(item.spanId);
      }
    },
    [setTraceId, setSpanId]
  );

  return (
    <TraceViewNavigationProvider<EventNavigationItem> config={getEventsConfig()} onNavigate={handleNavigate}>
      <SignalContent />
    </TraceViewNavigationProvider>
  );
}
