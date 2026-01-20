"use client";

import { Clock, Loader2, PlayIcon } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";

import { filters as traceFilters } from "@/components/traces/traces-table/columns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import DateRangeFilter from "@/components/ui/date-range-filter";
import Header from "@/components/ui/header";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/infinite-datatable/ui/datatable-filter";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type SemanticEventDefinitionRow } from "@/lib/actions/semantic-event-definitions";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

export default function SemanticEventBackfill() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [selectedEventDefinitionId, setSelectedEventDefinitionId] = useState<string>("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);

  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");

  // Set default time range if not present
  useEffect(() => {
    if (!pastHours && !startDate && !endDate) {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.replace(`${pathName}?${sp.toString()}`);
    }
  }, [pastHours, startDate, endDate, searchParams, pathName, router]);

  // Build URL for trace count
  const countUrlParams = new URLSearchParams();
  countUrlParams.set("action", "count");
  if (pastHours) countUrlParams.set("pastHours", pastHours);
  if (startDate) countUrlParams.set("startDate", startDate);
  if (endDate) countUrlParams.set("endDate", endDate);
  filter.forEach((f) => countUrlParams.append("filter", f));

  const countUrl =
    pastHours || startDate
      ? `/api/projects/${projectId}/semantic-event-definitions/backfill?${countUrlParams.toString()}`
      : null;

  // Fetch event definitions
  const { data: eventDefinitionsData, isLoading: isLoadingEventDefinitions } = useSWR<{
    items: SemanticEventDefinitionRow[];
  }>(`/api/projects/${projectId}/semantic-event-definitions?pageSize=100`, swrFetcher);

  // Fetch trace count
  const { data: countData, isLoading: isLoadingCount } = useSWR<{ count: number }>(countUrl, swrFetcher);

  const eventDefinitions = eventDefinitionsData?.items ?? [];
  const traceCount = countData?.count ?? null;
  const selectedEventDefinition = eventDefinitions.find((ed) => ed.id === selectedEventDefinitionId);
  const tracesToAnalyze = traceCount !== null ? Math.min(traceCount, 10000) : 0;

  const handleConfirm = useCallback(async () => {
    if (!selectedEventDefinitionId || traceCount === 0) return;

    setIsSubmitting(true);
    setShowConfirmDialog(false);

    try {
      const urlParams = new URLSearchParams();
      if (pastHours) urlParams.set("pastHours", pastHours);
      if (startDate) urlParams.set("startDate", startDate);
      if (endDate) urlParams.set("endDate", endDate);
      filter.forEach((f) => urlParams.append("filter", f));

      const traceIdsResponse = await fetch(
        `/api/projects/${projectId}/semantic-event-definitions/backfill?${urlParams.toString()}`
      );

      if (!traceIdsResponse.ok) {
        throw new Error("Failed to fetch trace IDs");
      }

      const { traceIds } = (await traceIdsResponse.json()) as { traceIds: string[] };

      if (traceIds.length === 0) {
        toast({
          title: "No traces found",
          description: "No traces match the current filters.",
          variant: "destructive",
        });
        return;
      }

      const backfillResponse = await fetch(`/api/projects/${projectId}/semantic-event-definitions/backfill`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventDefinitionId: selectedEventDefinitionId,
          traceIds,
        }),
      });

      if (!backfillResponse.ok) {
        const error = (await backfillResponse.json()) as { error: string };
        throw new Error(error.error || "Failed to trigger backfill");
      }

      toast({
        title: "Analysis started",
        description: `Started analyzing ${traceIds.length} traces. This may take a while to complete.`,
      });

      router.push(`/project/${projectId}/events/semantic`);
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start analysis. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [selectedEventDefinitionId, traceCount, pastHours, startDate, endDate, filter, projectId, toast, router]);

  const canSubmit = selectedEventDefinitionId && traceCount !== null && traceCount > 0 && !isLoadingCount;

  return (
    <>
      <Header
        path={[
          { name: "event definitions", href: `/project/${projectId}/events/semantic` },
          { name: "retroactive analysis" },
        ]}
      />
      <div className="flex flex-col flex-1 overflow-auto px-4 pb-4 gap-6">
        {/* Description */}
        <div className="flex flex-col gap-2 max-w-2xl">
          <p className="text-sm text-secondary-foreground">
            Run semantic event analysis on historical traces that were recorded before you created your event
            definitions. Select a time range, apply filters to target specific traces, and choose which event definition
            to use.
          </p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>This operation runs in the background and may take a while depending on the number of traces.</span>
          </div>
        </div>

        {/* Step 1: Filter Traces */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-xs font-medium">
              1
            </div>
            <Label className="font-medium">Select traces to analyze</Label>
          </div>
          <div className="flex flex-col gap-2 pl-7">
            <div className="flex flex-wrap items-center gap-2">
              <DataTableFilter columns={traceFilters} />
              <DateRangeFilter />
            </div>
            <DataTableFilterList />
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm text-muted-foreground">Matching traces:</span>
              {isLoadingCount ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <span className={cn("text-sm font-medium", traceCount === 0 && "text-muted-foreground")}>
                  {traceCount?.toLocaleString() ?? "—"}
                </span>
              )}
              {traceCount !== null && traceCount > 10000 && (
                <span className="text-xs text-muted-foreground">(max 10,000 will be processed)</span>
              )}
            </div>
          </div>
        </div>

        {/* Step 2: Select Event Definition */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-xs font-medium">
              2
            </div>
            <Label className="font-medium">Choose event definition</Label>
          </div>
          <div className="flex flex-col gap-2 pl-7">
            <Select
              value={selectedEventDefinitionId}
              onValueChange={setSelectedEventDefinitionId}
              disabled={isLoadingEventDefinitions}
            >
              <SelectTrigger className="w-[320px]">
                <SelectValue placeholder={isLoadingEventDefinitions ? "Loading..." : "Select event definition"} />
              </SelectTrigger>
              <SelectContent>
                {eventDefinitions.length === 0 && !isLoadingEventDefinitions ? (
                  <div className="px-2 py-4 text-sm text-muted-foreground text-center">
                    No event definitions found.{" "}
                    <Link href={`/project/${projectId}/events/semantic`} className="text-primary underline">
                      Create one first
                    </Link>
                  </div>
                ) : (
                  eventDefinitions.map((eventDef) => (
                    <SelectItem key={eventDef.id} value={eventDef.id}>
                      {eventDef.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Step 3: Start Analysis */}
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="flex items-center justify-center w-5 h-5 rounded-full bg-secondary text-xs font-medium">
              3
            </div>
            <Label className="font-medium">Start analysis</Label>
          </div>
          <div className="flex items-center gap-3 pl-7">
            <Button onClick={() => setShowConfirmDialog(true)} disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Starting...
                </>
              ) : (
                <>
                  <PlayIcon className="h-4 w-4 mr-2" />
                  Start Analysis
                </>
              )}
            </Button>
            <Link href={`/project/${projectId}/events/semantic`}>
              <Button variant="outline">Cancel</Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start Retroactive Analysis?</AlertDialogTitle>
            <AlertDialogDescription className="flex flex-col gap-2">
              <span>
                You are about to analyze <strong>{tracesToAnalyze.toLocaleString()} traces</strong> using the "
                <strong>{selectedEventDefinition?.name}</strong>" event definition.
              </span>
              <span>
                This operation will run in the background and may take a significant amount of time to complete
                depending on the complexity of your traces and event definition.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>Start Analysis</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
