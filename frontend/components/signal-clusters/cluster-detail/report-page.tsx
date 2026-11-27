"use client";

import { useSearchParams } from "next/navigation";

import { LAMINAR_AGENT_AVAILABLE } from "@/components/agent";
import ActivityTimeline from "@/components/signal-clusters/cluster-detail/activity-timeline";
import ClusterReport from "@/components/signal-clusters/cluster-detail/cluster-report";
import { dayLabel } from "@/components/signal-clusters/cluster-detail/dates";
import FrequencyChart from "@/components/signal-clusters/cluster-detail/frequency-chart";
import { DEFAULT_PAST_HOURS, useClusterDaily } from "@/components/signal-clusters/cluster-detail/use-cluster-daily";
import { useClusterReports } from "@/components/signal-clusters/cluster-detail/use-cluster-report";
import DateRangeFilter from "@/components/ui/date-range-filter";
import { ScrollArea } from "@/components/ui/scroll-area";
import { type SignalCluster } from "@/lib/actions/signal-clusters/types";

interface Props {
  projectId: string;
  signalId: string;
  cluster: SignalCluster;
  days: string[];
  color: string;
  onOpenTrace: (traceId: string) => void;
}

/** Summary, frequency, the newest report, then the cluster's activity, in one scroll. */
export default function ReportPage({ projectId, signalId, cluster, days, color, onOpenTrace }: Props) {
  const { reports, latest, isLoading, writing, generate } = useClusterReports(projectId, signalId, cluster.id);
  const shown = reports.find((r) => r.status === "done" && r.content) ?? null;
  const failed = latest?.status === "failed" && latest !== shown;
  const chart = useClusterDaily(projectId, signalId, cluster.id, { days, daily: cluster.daily });
  const inRange = chart.daily.reduce((a, b) => a + b, 0);
  const searchParams = useSearchParams();
  // A custom start/end range has no pastHours; only the default rolling window reads as "the last 30 days".
  const lastThirtyDays =
    !searchParams.get("startDate") &&
    Number(searchParams.get("pastHours") ?? DEFAULT_PAST_HOURS) === DEFAULT_PAST_HOURS;

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="[&>div]:!block">
      <div className="mx-auto flex w-full max-w-[796px] flex-col gap-8 px-6 pt-6 pb-26 3xl:max-w-[924px]">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{cluster.name}</h1>
          <p className="flex flex-wrap items-center gap-x-2.5 text-sm text-muted-foreground">
            <span>
              {inRange.toLocaleString()} {inRange === 1 ? "event" : "events"}{" "}
              {lastThirtyDays ? "in the last 30 days" : "in the selected range"}
            </span>
            <span aria-hidden>·</span>
            <span>First seen {dayLabel(cluster.firstSeen)}</span>
            <span aria-hidden>·</span>
            <span>Last seen {dayLabel(cluster.lastSeen)}</span>
          </p>
        </div>

        <FrequencyChart
          projectId={projectId}
          signalId={signalId}
          clusterId={cluster.id}
          daily={chart.daily}
          resolutions={cluster.resolutions}
          days={chart.days}
          start={chart.start}
          toNow={chart.toNow}
          color={color}
          heading={<DateRangeFilter />}
        />

        {LAMINAR_AGENT_AVAILABLE && (
          <ClusterReport
            report={shown}
            isLoading={isLoading}
            writing={writing}
            failed={failed}
            archived={!!cluster.archived}
            onGenerate={() => void generate()}
            onOpenTrace={onOpenTrace}
          />
        )}

        <ActivityTimeline
          cluster={cluster}
          reports={reports}
          shownReportId={shown?.id ?? null}
          writing={writing}
          onOpenTrace={onOpenTrace}
        />
      </div>
    </ScrollArea>
  );
}
