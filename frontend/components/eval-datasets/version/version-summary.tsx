import Link from "next/link";
import { type ReactNode } from "react";

import ClientTimestampFormatter from "@/components/client-timestamp-formatter";
import { type EvalDatasetVersionDetails, evaluationGroupOf } from "@/lib/actions/eval-datasets/types";

import { evalDatasetVersionHref, versionEvaluationsHref } from "../constants";

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex items-center gap-1.5">
    <span className="text-muted-foreground">{label}</span>
    <span className="text-secondary-foreground">{children}</span>
  </div>
);

interface VersionSummaryProps {
  projectId: string;
  details: EvalDatasetVersionDetails;
  /** The compare picker. */
  children: ReactNode;
}

/** The version's message and metadata, a link to its runs, and the compare picker. */
export default function VersionSummary({ projectId, details, children }: VersionSummaryProps) {
  const { dataset, version, parentVersion, message, authorName, authorEmail, createdAt, runCount, tasks } = details;
  return (
    <div className="flex flex-none flex-col gap-2 px-4 pb-3">
      <p className="truncate text-sm" title={message ?? undefined}>
        {message ?? <span className="text-muted-foreground">No message</span>}
      </p>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs">
        <Field label="Parent">
          {parentVersion === null ? (
            "none"
          ) : (
            <Link className="hover:underline" href={evalDatasetVersionHref(projectId, dataset, parentVersion)}>
              v{parentVersion}
            </Link>
          )}
        </Field>
        <Field label="Author">
          <span title={authorEmail ?? undefined}>{authorName ?? "unknown"}</span>
        </Field>
        <Field label="Created">
          <ClientTimestampFormatter timestamp={createdAt} className="text-xs" />
        </Field>
        <Field label="Tasks">{tasks.length}</Field>
        <Field label="Evaluations">
          {runCount > 0 ? (
            <Link
              className="text-primary-text hover:underline"
              href={versionEvaluationsHref(projectId, evaluationGroupOf(dataset, version))}
            >
              {runCount === 1 ? "1 run" : `${runCount} runs`}
            </Link>
          ) : (
            "no runs"
          )}
        </Field>
        <div className="flex-1" />
        {children}
      </div>
    </div>
  );
}
