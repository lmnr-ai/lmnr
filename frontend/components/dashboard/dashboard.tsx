"use client";

import { DashboardTraceProvider, useDashboardTraceStore } from "@/components/dashboard/dashboard-trace-context";
import AddChartDropdown from "@/components/dashboard/add-chart-dropdown";
import GridLayout from "@/components/dashboard/grid-layout";
import { TraceViewSidePanel } from "@/components/traces/trace-view";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

function DashboardContent() {
  const { traceId, spanId, closeTrace } = useDashboardTraceStore((s) => ({
    traceId: s.traceId,
    spanId: s.spanId,
    closeTrace: s.closeTrace,
  }));

  return (
    <>
      <Header path={"Home"}>
        <div className="h-12 flex gap-2 w-full items-center">
          <DateRangeFilter />
          <GroupByPeriodSelect />
          <div className="ml-auto">
            <AddChartDropdown />
          </div>
        </div>
      </Header>
      <div className="flex-1 overflow-hidden">
        <ScrollArea className="h-full">
          <div className="h-full px-4 pb-4">
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
      <DashboardContent />
    </DashboardTraceProvider>
  );
}
