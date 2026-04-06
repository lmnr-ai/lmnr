"use client";

import Link from "next/link";

import { DashboardTraceProvider, useDashboardTraceContext } from "@/components/dashboard/dashboard-trace-context";
import GridLayout from "@/components/dashboard/grid-layout";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import { Button } from "@/components/ui/button";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";

function DashboardContent() {
  const { traceId, spanId, closeTrace } = useDashboardTraceContext();

  return (
    <>
      <Header path={"Home"}>
        <div className="h-12 flex gap-2 w-full items-center">
          <DateRangeFilter />
          <GroupByPeriodSelect />
          <Link passHref className="ml-auto" href={{ pathname: "dashboard/new" }}>
            <Button icon="plus">Chart</Button>
          </Link>
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
