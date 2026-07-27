"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { CreateSignalJobChrome } from "@/components/signal/create-signal-job/chrome";
import ConfirmSignalJobDialog from "@/components/signal/create-signal-job/confirm-signal-job-dialog";
import { CreateSignalJobGrid, type PendingJobState } from "@/components/signal/create-signal-job/grid";
import { useSignalStoreContext } from "@/components/signal/store";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { columns, defaultTracesColumnOrder } from "@/components/traces/traces-table/columns";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { type Filter } from "@/lib/actions/common/filters";
import { Feature } from "@/lib/features/features";
import { useToast } from "@/lib/hooks/use-toast";

const CreateSignalJobContent = () => {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { projectId } = useParams<{ projectId: string }>();
  const { toast } = useToast();

  const signal = useSignalStoreContext((state) => state.signal);
  const featureFlags = useFeatureFlags();

  const [isCreating, setIsCreating] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [pendingJob, setPendingJob] = useState<PendingJobState | null>(null);
  const [jobMode, setJobMode] = useState(featureFlags[Feature.BATCH_SIGNALS] ? 0 : 1);
  const [searchValue, setSearchValue] = useState<{ filters: Filter[]; search: string }>({
    filters: [],
    search: "",
  });
  const [dateRange, setDateRange] = useState<{
    pastHours?: string;
    startDate?: string;
    endDate?: string;
  }>({ pastHours: "24" });

  const { traceId, spanId, setTraceId, setSpanId } = useSignalStoreContext((state) => ({
    traceId: state.traceId,
    spanId: state.spanId,
    setTraceId: state.setTraceId,
    setSpanId: state.setSpanId,
  }));

  const refetchRef = useRef<() => void>(() => {});

  const handleRefresh = useCallback(() => {
    refetchRef.current();
  }, []);

  const filter = useMemo(() => searchValue.filters.map((f) => JSON.stringify(f)), [searchValue.filters]);
  const search = searchValue.search.length > 0 ? searchValue.search : null;

  const handleOpenConfirmDialog = useCallback((state: PendingJobState) => {
    setPendingJob(state);
    setConfirmDialogOpen(true);
  }, []);

  const handleCreateSignalJob = useCallback(async () => {
    if (!pendingJob) return;
    try {
      setIsCreating(true);
      const { selectionMode, selectedIds, traceCount, selectedCount } = pendingJob;
      const traceIds = selectionMode === "all" ? undefined : selectedIds;
      const count = selectionMode === "all" ? traceCount : selectedCount;

      const response = await fetch(`/api/projects/${projectId}/signals/${signal.id}/jobs`, {
        method: "POST",
        body: JSON.stringify({
          filter: searchValue.filters.map((f) => JSON.stringify(f)),
          search: searchValue.search || undefined,
          pastHours: dateRange.pastHours,
          startDate: dateRange.startDate,
          endDate: dateRange.endDate,
          traceIds,
          tracesCount: count,
          mode: jobMode,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error ?? "Failed to create backfill");
      }

      setConfirmDialogOpen(false);
      router.push(`/project/${projectId}/signals/${signal.id}?tab=settings&section=activity`);
      toast({
        title: "Backfill created",
        description: `Backfill for "${signal.name}" has been queued for ${count?.toLocaleString() ?? "selected"} traces.`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create backfill. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  }, [pendingJob, projectId, signal.id, signal.name, searchValue, dateRange, jobMode, router, toast]);

  const chrome = (
    <CreateSignalJobChrome
      columns={columns}
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onRefresh={handleRefresh}
    />
  );

  return (
    <>
      <ConfirmSignalJobDialog
        open={confirmDialogOpen}
        onOpenChange={setConfirmDialogOpen}
        isCreating={isCreating}
        onConfirm={handleCreateSignalJob}
        traceCount={
          pendingJob ? (pendingJob.selectionMode === "all" ? pendingJob.traceCount : pendingJob.selectedCount) : 0
        }
        mode={jobMode}
        onModeChange={setJobMode}
      />
      <div className="flex gap-2 px-4 pt-2 pb-4">
        <p className="text-sm text-muted-foreground">
          Selected traces will be analyzed against the{" "}
          <span className="font-medium text-foreground">"{signal.name}"</span> signal. You can select specific traces or
          all matching traces based on your current filters and time range.
        </p>
      </div>
      <div className="flex flex-1 overflow-hidden px-4 pb-4">
        <CreateSignalJobGrid
          chrome={chrome}
          filter={filter}
          search={search}
          dateRange={dateRange}
          refetchRef={refetchRef}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          onOpenConfirmDialog={handleOpenConfirmDialog}
          onTraceIdSelect={setTraceId}
        />
      </div>
      {traceId && (
        <TraceViewSidePanel
          className="z-60 pointer-events-auto"
          spanId={spanId || undefined}
          key={traceId}
          onClose={() => {
            const params = new URLSearchParams(searchParams);
            params.delete("traceId");
            params.delete("spanId");
            router.push(`${pathName}?${params.toString()}`);
            setTraceId(null);
            setSpanId(null);
          }}
          traceId={traceId}
        />
      )}
    </>
  );
};

export default function CreateSignalJob({ traceId }: { traceId?: string }) {
  const { setTraceId } = useSignalStoreContext((state) => ({
    setTraceId: state.setTraceId,
  }));

  useEffect(() => {
    setTraceId(traceId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <InfiniteDataTableProvider
      defaults={{ columnOrder: ["__row_selection", ...defaultTracesColumnOrder] }}
      lockedColumns={["__row_selection", "status"]}
    >
      <CreateSignalJobContent />
    </InfiniteDataTableProvider>
  );
}
