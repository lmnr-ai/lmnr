"use client";

import { format, formatRelative } from "date-fns";
import { Network } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Resizable, ResizeCallback } from "re-resizable";
import React, { useCallback, useEffect, useRef, useState } from "react";

import ManageEventDefinitionDialog, {
  ManageEventDefinitionForm,
} from "@/components/event-definitions/manage-event-definition-dialog";
import ClustersTable from "@/components/events/clusters-table";
import { useEventsStoreContext } from "@/components/events/events-store";
import EventsTable from "@/components/events/events-table";
import StartClusteringDialog from "@/components/events/start-clustering-dialog";
import { EventNavigationItem, getEventsConfig } from "@/components/events/utils";
import TraceView from "@/components/traces/trace-view";
import TraceViewNavigationProvider from "@/components/traces/trace-view/navigation-context";
import { filterColumns, getDefaultTraceViewWidth } from "@/components/traces/trace-view/utils";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import FiltersContextProvider from "@/components/ui/infinite-datatable/ui/datatable-filter/context";
import { ScrollArea } from "@/components/ui/scroll-area.tsx";
import { useProjectContext } from "@/contexts/project-context";
import { setEventsTraceViewWidthCookie } from "@/lib/actions/traces/cookies";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils.ts";

import Header from "../ui/header";

function PureEvents({
  lastEvent,
  initialTraceViewWidth,
}: {
  lastEvent?: { id: string; name: string; timestamp: string };
  initialTraceViewWidth?: number;
}) {
  const pathName = usePathname();
  const { push } = useRouter();
  const searchParams = useSearchParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDisableClusteringDialogOpen, setIsDisableClusteringDialogOpen] = useState(false);
  const ref = useRef<Resizable>(null);
  const { workspace, project } = useProjectContext();
  const { toast } = useToast();

  const { eventDefinition, setEventDefinition, traceId, spanId, setTraceId, setSpanId, clusterConfig, setClusterConfig } =
    useEventsStoreContext((state) => ({
      eventDefinition: state.eventDefinition,
      setEventDefinition: state.setEventDefinition,
      traceId: state.traceId,
      spanId: state.spanId,
      setTraceId: state.setTraceId,
      setSpanId: state.setSpanId,
      clusterConfig: state.clusterConfig,
      setClusterConfig: state.setClusterConfig,
    }));

  const [defaultTraceViewWidth, setDefaultTraceViewWidth] = useState(initialTraceViewWidth || 1000);
  const isFreeTier = workspace?.tierName.toLowerCase().trim() === "free";

  useEffect(() => {
    if (!initialTraceViewWidth) {
      setDefaultTraceViewWidth(getDefaultTraceViewWidth());
    }
  }, [initialTraceViewWidth]);

  const handleEditEvent = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

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

  const handleResizeStop: ResizeCallback = (_event, _direction, _elementRef, delta) => {
    const newWidth = defaultTraceViewWidth + delta.width;
    setDefaultTraceViewWidth(newWidth);
    setEventsTraceViewWidthCookie(newWidth).catch((e) => console.warn(`Failed to save value to cookies. ${e}`));
  };

  const handleDisableClustering = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${project?.id}/events/${eventDefinition.name}/cluster-config`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const error = await res.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: error.error || "Failed to disable clustering",
        });
        return;
      }

      setClusterConfig(undefined);
      toast({ title: "Clustering disabled successfully" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to disable clustering",
      });
    } finally {
      setIsDisableClusteringDialogOpen(false);
    }
  }, [project?.id, eventDefinition.name, setClusterConfig, toast]);

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
      <Header path={`events/${eventDefinition.name}`} />
      <ScrollArea>
        <div className="flex flex-col gap-4 flex-1 px-4 pb-4">
          <div className="flex items-center gap-4">
            {!isFreeTier && (
              <ManageEventDefinitionDialog
                open={isDialogOpen}
                setOpen={setIsDialogOpen}
                defaultValues={eventDefinition}
                key={eventDefinition.id}
                onSuccess={handleSuccess}
              >
                <Button icon="edit" onClick={handleEditEvent}>
                  Event Definition
                </Button>
              </ManageEventDefinitionDialog>
            )}

            {clusterConfig ? (
              <>
                <Button variant="outlinePrimary" onClick={() => setIsDisableClusteringDialogOpen(true)}>
                  <Network className="mr-2 size-3.5" />
                  Disable Clustering
                </Button>
                <ConfirmDialog
                  open={isDisableClusteringDialogOpen}
                  onOpenChange={setIsDisableClusteringDialogOpen}
                  title="Disable Clustering"
                  description="Are you sure you want to disable clustering for this event?"
                  confirmText="Disable"
                  cancelText="Cancel"
                  onConfirm={handleDisableClustering}
                />
              </>
            ) : (
              <StartClusteringDialog eventName={eventDefinition.name}>
                <Button variant="outlinePrimary">
                  <Network className="mr-2 size-3.5" />
                  Start Clustering
                </Button>
              </StartClusteringDialog>
            )}
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <span className="text-lg font-semibold">Clusters</span>
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
        </div>
      </ScrollArea>

      {traceId && (
        <div className="absolute top-0 right-0 bottom-0 bg-background border-l z-50 flex">
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

export default function Events({
  lastEvent,
  initialTraceViewWidth,
}: {
  lastEvent?: { id: string; name: string; timestamp: string };
  initialTraceViewWidth?: number;
}) {
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
      <PureEvents lastEvent={lastEvent} initialTraceViewWidth={initialTraceViewWidth} />
    </TraceViewNavigationProvider>
  );
}
