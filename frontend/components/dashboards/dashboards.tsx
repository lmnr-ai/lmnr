"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";

import AddChartDropdown from "@/components/dashboards/add-chart-dropdown";
import { DashboardSelectionProvider } from "@/components/dashboards/dashboard-selection-store";
import { DashboardTraceProvider, useDashboardTraceStore } from "@/components/dashboards/dashboard-trace-context";
import GridLayout from "@/components/dashboards/grid-layout";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { track } from "@/lib/posthog";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

function DashboardContent() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchParams = useSearchParams();
  const isNewChart = searchParams.get("newChart") === "1";
  const { traceId, spanId, closeTrace } = useDashboardTraceStore((s) => ({
    traceId: s.traceId,
    spanId: s.spanId,
    closeTrace: s.closeTrace,
  }));

  const scrollToBottom = useCallback(() => {
    const viewport = scrollRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    track("dashboards", "page_viewed");
  }, []);

  useEffect(() => {
    if (isNewChart) {
      requestAnimationFrame(() => scrollToBottom());
      window.history.replaceState(null, "", window.location.pathname + window.location.hash);
    }
  }, [isNewChart, scrollToBottom]);

  return (
    <>
      <Header path={"Dashboards"}>
        <div className="h-12 flex gap-2 w-full items-center">
          <DateRangeFilter />
          <GroupByPeriodSelect />
          <div className="ml-auto">
            <AddChartDropdown onChartCreated={scrollToBottom} />
          </div>
        </div>
      </Header>
      <div className="flex-1 overflow-hidden">
        <ScrollArea ref={scrollRef} className="h-full">
          <div className="h-full px-4 pb-[150px]">
            <GridLayout />
          </div>
        </ScrollArea>
      </div>
      {traceId && <TraceViewSidePanel traceId={traceId} spanId={spanId ?? undefined} onClose={closeTrace} />}
    </>
  );
}

export default function Dashboard() {
  return (
    <DashboardTraceProvider>
      <DashboardSelectionProvider>
        <DashboardContent />
      </DashboardSelectionProvider>
    </DashboardTraceProvider>
  );
}
