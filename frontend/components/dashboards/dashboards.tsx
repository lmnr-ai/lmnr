"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { useSWRConfig } from "swr";

import { useReportAgentContextName } from "@/components/agent";
import AddChartDropdown from "@/components/dashboards/add-chart-dropdown";
import CollapsiblePreviews from "@/components/dashboards/dashboard-previews/collapsible-previews";
import PreviewsToggle from "@/components/dashboards/dashboard-previews/previews-toggle";
import { useDashboardActions } from "@/components/dashboards/dashboard-previews/use-dashboard-actions";
import { DashboardRefreshProvider, useDashboardRefresh } from "@/components/dashboards/dashboard-refresh-context";
import { DashboardSelectionProvider } from "@/components/dashboards/dashboard-selection-store";
import { DashboardTraceProvider, useDashboardTraceStore } from "@/components/dashboards/dashboard-trace-context";
import GridLayout from "@/components/dashboards/grid-layout";
import { getChartsUrl, getDashboardsUrl } from "@/components/dashboards/types";
import { TraceViewSidePanel } from "@/components/traces/trace-view";
import RefreshButton from "@/components/ui/infinite-datatable/ui/refresh-button";
import { LAST_DASHBOARD_ID, LAST_ID_COOKIE_MAX_AGE } from "@/lib/cookies";
import { track } from "@/lib/posthog";
import { withBasePath } from "@/lib/utils";

import DateRangeFilter from "../ui/date-range-filter";
import { GroupByPeriodSelect } from "../ui/group-by-period-select";
import Header from "../ui/header";
import { ScrollArea } from "../ui/scroll-area";
import { Skeleton } from "../ui/skeleton";

function DashboardContent() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>();
  const searchParams = useSearchParams();
  const isNewChart = searchParams.get("newChart") === "1";
  const { traceId, spanId, signalId, closeTrace } = useDashboardTraceStore((s) => ({
    traceId: s.traceId,
    spanId: s.spanId,
    signalId: s.signalId,
    closeTrace: s.closeTrace,
  }));
  const { refresh } = useDashboardRefresh();
  const { dashboards, current, getDashboardHref, createDashboard, renameDashboard, deleteDashboard } =
    useDashboardActions();
  const { mutate } = useSWRConfig();
  useReportAgentContextName("dashboard", current?.name);

  // The agent can edit dashboards and charts server-side, so refresh re-reads them too, not just chart data.
  const handleRefresh = useCallback(() => {
    refresh();
    mutate(getChartsUrl(projectId, dashboardId));
    mutate(getDashboardsUrl(projectId));
  }, [refresh, mutate, projectId, dashboardId]);

  const scrollToBottom = useCallback(() => {
    const viewport = scrollRef.current;
    if (viewport) {
      viewport.scrollTo({ top: viewport.scrollHeight, behavior: "smooth" });
    }
  }, []);

  useEffect(() => {
    track("dashboards", "page_viewed");
  }, []);

  // Read by the `/dashboards` redirect to reopen the last-visited dashboard.
  useEffect(() => {
    const path = withBasePath(`/project/${projectId}/dashboards`);
    document.cookie = `${LAST_DASHBOARD_ID}=${dashboardId};path=${path};max-age=${LAST_ID_COOKIE_MAX_AGE}`;
  }, [projectId, dashboardId]);

  useEffect(() => {
    if (isNewChart) {
      requestAnimationFrame(() => scrollToBottom());
      // Drop only the one-shot flag; the time range params stay.
      const url = new URL(window.location.href);
      url.searchParams.delete("newChart");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [isNewChart, scrollToBottom]);

  return (
    <>
      <Header path={"Dashboards"}>
        <div className="text-secondary-foreground/40">/</div>
        <div className="ml-1 min-w-0">
          {current ? <PreviewsToggle name={current.name} /> : <Skeleton className="h-7 w-28" />}
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 ml-2">
          {/* A narrow header truncates the absolute range rather than outgrowing the shared header height. */}
          <DateRangeFilter className="min-w-0 [&>div]:min-w-0 [&>div>span]:truncate" />
          <GroupByPeriodSelect />
          <RefreshButton onClick={handleRefresh} variant="outline" />
          <div className="ml-auto">
            <AddChartDropdown onChartCreated={scrollToBottom} />
          </div>
        </div>
      </Header>
      <div className="flex min-h-0 flex-1 flex-col">
        <CollapsiblePreviews
          dashboards={dashboards}
          getHref={getDashboardHref}
          onCreate={createDashboard}
          onRename={renameDashboard}
          onDelete={deleteDashboard}
        />
        {/* Keyed so the grid and its scroll start fresh per dashboard while the shell stays mounted. */}
        <div key={dashboardId} className="min-h-0 flex-1 overflow-hidden">
          <ScrollArea ref={scrollRef} className="h-full" viewportClassName="scroll-fade-t [--scroll-fade-t-size:12px]">
            <div className="h-full px-4 pb-[150px]">
              <GridLayout />
            </div>
          </ScrollArea>
        </div>
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
