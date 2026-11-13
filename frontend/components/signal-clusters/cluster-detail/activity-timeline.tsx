"use client";

import { AlertCircle, Archive, Box, Check, FileText, Loader2, RotateCcw } from "lucide-react";
import { type ReactNode } from "react";

import ReportMarkdown from "@/components/signal-clusters/cluster-detail/report-markdown";
import {
  StepCollapsible,
  StepCollapsibleContent,
  StepCollapsibleTrigger,
  StepDescription,
  StepIcon,
  StepLine,
  StepList,
  StepTitle,
} from "@/components/ui/step-list";
import { type ClusterReport, type SignalCluster } from "@/lib/actions/signal-clusters/types";
import { AUTO_RESOLVE_DAYS } from "@/lib/signals/settings";
import { formatRelativeTime } from "@/lib/utils";

interface Entry {
  key: string;
  at: string;
  node: ReactNode;
}

const line = (icon: ReactNode, title: ReactNode, at: string, status?: "running" | "error") => (
  <StepLine status={status}>
    <StepIcon>{icon}</StepIcon>
    <StepTitle>{title}</StepTitle>
    <StepDescription className="normal-nums">
      <time dateTime={at}>{formatRelativeTime(at)}</time>
    </StepDescription>
  </StepLine>
);

const actor = (name: string | null) => <span className="text-foreground">{name ?? "A removed user"}</span>;

interface Props {
  cluster: SignalCluster;
  /** Newest first. */
  reports: ClusterReport[];
  /** The report shown above the activity, which stays a plain row here. */
  shownReportId: string | null;
  writing: boolean;
  onOpenTrace: (traceId: string) => void;
}

/** The cluster's history, oldest first, like an activity feed. Older reports expand in place. */
export default function ActivityTimeline({ cluster, reports, shownReportId, writing, onOpenTrace }: Props) {
  const reportEntries = reports.map((r, i): Entry => {
    if (r.status === "pending" && i === 0 && writing) {
      return {
        key: r.id,
        at: r.createdAt,
        node: line(<Loader2 className="animate-spin" />, "Laminar agent is writing a report", r.createdAt, "running"),
      };
    }
    if (r.status !== "done" || !r.content) {
      return { key: r.id, at: r.createdAt, node: line(<AlertCircle />, "Report failed", r.updatedAt, "error") };
    }
    const created = line(<FileText />, "Report created", r.updatedAt);
    if (r.id === shownReportId) return { key: r.id, at: r.updatedAt, node: created };
    return {
      key: r.id,
      at: r.updatedAt,
      node: (
        <StepCollapsible>
          <StepCollapsibleTrigger>{created}</StepCollapsibleTrigger>
          <StepCollapsibleContent className="text-sm text-foreground">
            <ReportMarkdown onOpenTrace={onOpenTrace}>{r.content}</ReportMarkdown>
          </StepCollapsibleContent>
        </StepCollapsible>
      ),
    };
  });

  const entries: Entry[] = [
    { key: "created", at: cluster.createdAt, node: line(<Box />, "Cluster created", cluster.createdAt) },
    ...reportEntries,
    ...cluster.resolutions.flatMap((r, i): Entry[] => [
      {
        key: `resolved-${i}`,
        at: r.resolvedAt,
        node: line(
          <Check className="text-success" />,
          r.automatic ? (
            <>Resolved automatically after {AUTO_RESOLVE_DAYS} days without events</>
          ) : (
            <>{actor(r.resolvedBy)} marked this resolved</>
          ),
          r.resolvedAt
        ),
      },
      ...(r.reopenedAt
        ? [
            {
              key: `reopened-${i}`,
              at: r.reopenedAt,
              node: line(
                <RotateCcw className="text-amber-500" />,
                r.reopenedAutomatically ? (
                  <>Reopened when new events arrived</>
                ) : (
                  <>{actor(r.reopenedBy)} reopened this</>
                ),
                r.reopenedAt
              ),
            },
          ]
        : []),
    ]),
    ...(cluster.archived
      ? [
          {
            key: "archived",
            at: cluster.archived.archivedAt,
            node: line(
              <Archive />,
              <>{actor(cluster.archived.archivedBy)} archived this</>,
              cluster.archived.archivedAt
            ),
          },
        ]
      : []),
    // Stable sort keeps "Cluster created" first when a report shares its timestamp.
  ].sort((a, b) => a.at.localeCompare(b.at));

  return (
    <section className="mt-5 flex flex-col gap-3">
      <h2 className="text-sm font-medium">Activity</h2>
      <StepList className="gap-3">
        {entries.map((e) => (
          <div key={e.key}>{e.node}</div>
        ))}
      </StepList>
    </section>
  );
}
