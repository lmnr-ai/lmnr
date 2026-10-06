"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import AddChartDropdown from "@/components/dashboards/add-chart-dropdown";
import { DashboardRefreshProvider, useDashboardRefresh } from "@/components/dashboards/dashboard-refresh-context";
import { DashboardSelectionProvider } from "@/components/dashboards/dashboard-selection-store";
import { DashboardTraceProvider, useDashboardTraceStore } from "@/components/dashboards/dashboard-trace-context";
import GridLayout from "@/components/dashboards/grid-layout";
import { useLastDashboardRange } from "@/components/dashboards/use-last-range";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import { track } from "@/lib/posthog";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

function DashboardContent() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const isNewChart = searchParams.get("newChart") === "1";
  const { traceId, spanId, signalId, closeTrace } = useDashboardTraceStore((s) => ({
    traceId: s.traceId,
    spanId: s.spanId,
    signalId: s.signalId,
    closeTrace: s.closeTrace,
  }));
  const { refresh } = useDashboardRefresh();
  const { ready, onRangeChange } = useLastDashboardRange();

  const scrollToBottom = useCallback(() => {
    const viewport = scrollRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    track("dashboards", "page_viewed");
  }, []);

  const scrollToNewChart = useRef(false);

  useEffect(() => {
    if (!isNewChart) return;
    scrollToNewChart.current = true;
    // Strip only the one-shot flag; dropping the whole query would also drop the date range.
    const params = new URLSearchParams(window.location.search);
    params.delete("newChart");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`
    );
  }, [isNewChart]);

  // The grid mounts only once the range is ready, so the scroll waits for it.
  useEffect(() => {
    if (!ready || !scrollToNewChart.current) return;
    scrollToNewChart.current = false;
    requestAnimationFrame(() => scrollToBottom());
  }, [ready, isNewChart, scrollToBottom]);

  return (
    <>
      <Header path={"Dashboards"}>
        <div className="h-12 flex gap-2 w-full items-center">
          <DateRangeFilter onChange={onRangeChange} />
          <GroupByPeriodSelect />
          <RefreshButton onClick={refresh} variant="outline" />
          <div className="ml-auto">
            <AddChartDropdown onChartCreated={scrollToBottom} />
          </div>
        </div>
      </Header>
      <div className="flex-1 overflow-hidden">
        <ScrollArea ref={scrollRef} className="h-full">
          <div className="h-full px-4 pb-[150px]">{ready && <GridLayout />}</div>
        </ScrollArea>
      </div>
      {traceId && (
        <TraceViewSidePanel
          traceId={traceId}
          spanId={spanId ?? undefined}
          initialSignalId={signalId ?? undefined}
          onClose={closeTrace}
        />
      )}
    </>
  );
}

export default function Dashboard() {
  return (
    <DashboardTraceProvider>
      <DashboardSelectionProvider>
        <DashboardRefreshProvider>
          <DashboardContent />
        </DashboardRefreshProvider>
      </DashboardSelectionProvider>
    </DashboardTraceProvider>
  );
}
