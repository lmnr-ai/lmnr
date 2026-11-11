"use client";

import { FileText, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type ReactNode } from "react";

import ReportMarkdown from "@/components/signal-clusters/cluster-detail/report-markdown";
import { useSignalStoreContext } from "@/components/signal/store.tsx";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type ClusterReport as Report } from "@/lib/actions/signal-clusters/types";

interface Props {
  /** The newest finished report; older ones live in the activity list. */
  report: Report | null;
  isLoading: boolean;
  writing: boolean;
  /** The newest attempt failed, with no newer finished report. */
  failed: boolean;
  archived: boolean;
  onGenerate: () => void;
  onOpenTrace: (traceId: string) => void;
}

/** The newest report at the top of the page, or a placeholder saying why there is none. */
export default function ClusterReport({
  report,
  isLoading,
  writing,
  failed,
  archived,
  onGenerate,
  onOpenTrace,
}: Props) {
  const { projectId } = useParams<{ projectId: string }>();
  const signal = useSignalStoreContext((state) => state.signal);

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  if (report?.content) {
    return <ReportMarkdown onOpenTrace={onOpenTrace}>{report.content}</ReportMarkdown>;
  }

  if (writing) {
    return (
      <Placeholder
        icon={<Loader2 className="size-5 animate-spin text-muted-foreground" />}
        title="Writing a report"
        detail="Laminar agent is investigating the traces and code."
      />
    );
  }

  if (archived) return <Placeholder detail="Archived clusters don't get reports." />;

  if (!signal.reportsEnabled) {
    return (
      <Placeholder detail="Reports are off for this signal.">
        <Button variant="outline" asChild>
          <Link href={`/project/${projectId}/signals/${signal.id}?tab=settings`}>Turn on in settings</Link>
        </Button>
      </Placeholder>
    );
  }

  return (
    <Placeholder
      detail={
        failed
          ? "The last attempt failed. Try again."
          : "Laminar agent will investigate the traces and code and write one."
      }
    >
      <Button variant="outline" onClick={onGenerate}>
        Generate report
      </Button>
    </Placeholder>
  );
}

function Placeholder({
  icon = <FileText className="size-5 text-muted-foreground" />,
  title = "No report yet",
  detail,
  children,
}: {
  icon?: ReactNode;
  title?: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed px-4 py-8 text-center">
      {icon}
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">{title}</span>
        <span className="text-xs text-muted-foreground">{detail}</span>
      </div>
      {children}
    </div>
  );
}
