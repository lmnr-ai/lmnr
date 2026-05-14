"use client";

import { ChevronDown, Database, ListChecks, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useState } from "react";

import ColumnAssignmentDnd, {
  buildInitialColumns,
  type CategorizedColumns,
  EMPTY_CATEGORIZED_COLUMNS,
} from "@/components/sql/column-assignment-dnd";
import { Button } from "@/components/ui/button";
import DatasetSelect from "@/components/ui/dataset-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import QueueSelect from "@/components/ui/queue-select";
import { type Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { type LabelingQueue } from "@/lib/queue/types";

import ExportJobDialog from "./export-job-dialog";

interface ExportResultsDialogProps {
  results: Record<string, any>[] | null;
  sqlQuery: string;
  sqlTemplateId?: string;
}

const buildBucketedRows = (results: Record<string, any>[], columns: CategorizedColumns) =>
  results.map((row) => {
    const data: Record<string, unknown> = {};
    const target: Record<string, unknown> = {};
    const metadata: Record<string, unknown> = {};
    columns.data.forEach((key) => {
      data[key] = row[key];
    });
    columns.target.forEach((key) => {
      target[key] = row[key];
    });
    columns.metadata.forEach((key) => {
      metadata[key] = row[key];
    });
    return { data, target, metadata };
  });

function ExportDatasetDialog({ results, children }: PropsWithChildren<Pick<ExportResultsDialogProps, "results">>) {
  const { projectId } = useParams();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [columnsByCategory, setColumnsByCategory] = useState<CategorizedColumns>(EMPTY_CATEGORIZED_COLUMNS);
  const { toast } = useToast();

  const handleDialogOpen = (open: boolean) => {
    if (open && results && results.length > 0) {
      setColumnsByCategory(buildInitialColumns(Object.keys(results[0])));
    } else {
      setSelectedDataset(null);
    }
    setIsExportDialogOpen(open);
  };

  const exportToDataset = useCallback(async () => {
    if (!selectedDataset || !results || results.length === 0) return;

    setIsExporting(true);

    try {
      const datapoints = buildBucketedRows(results, columnsByCategory);

      const res = await fetch(`/api/projects/${projectId}/sql/export/${selectedDataset.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ datapoints }),
      });

      if (!res.ok) {
        throw new Error("Failed to export data");
      }

      track("sql_editor", "exported_to_dataset", { count: datapoints.length });
      toast({
        title: `Exported to dataset`,
        description: (
          <span>
            Successfully exported {datapoints.length} results to dataset.{" "}
            <Link className="text-primary" href={`/project/${projectId}/datasets/${selectedDataset.id}`}>
              Go to dataset.
            </Link>
          </span>
        ),
      });

      setIsExportDialogOpen(false);
    } catch (err) {
      toast({
        title: "Failed to export data",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  }, [columnsByCategory, projectId, results, selectedDataset, toast]);

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <Dialog open={isExportDialogOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl bg-background">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle>Export SQL Results to Dataset</DialogTitle>
          <Button
            onClick={exportToDataset}
            disabled={
              isExporting ||
              !selectedDataset ||
              (columnsByCategory.data.length === 0 && columnsByCategory.target.length === 0)
            }
          >
            {isExporting && <Loader2 className="mr-2 animate-spin w-4 h-4" />}
            Export to Dataset
          </Button>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-4">
          <DatasetSelect onChange={(dataset) => setSelectedDataset(dataset)} />
          <ColumnAssignmentDnd value={columnsByCategory} onChange={setColumnsByCategory} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExportQueueDialog({
  results,
  sqlTemplateId,
  children,
}: PropsWithChildren<Pick<ExportResultsDialogProps, "results" | "sqlTemplateId">>) {
  const { projectId } = useParams();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedQueue, setSelectedQueue] = useState<LabelingQueue | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [columnsByCategory, setColumnsByCategory] = useState<CategorizedColumns>(EMPTY_CATEGORIZED_COLUMNS);
  const { toast } = useToast();

  const handleDialogOpen = (open: boolean) => {
    if (open && results && results.length > 0) {
      setColumnsByCategory(buildInitialColumns(Object.keys(results[0])));
    } else {
      setSelectedQueue(null);
    }
    setIsExportDialogOpen(open);
  };

  const exportToQueue = useCallback(async () => {
    if (!selectedQueue || !results || results.length === 0) return;

    setIsExporting(true);

    try {
      const now = new Date().toISOString();
      const items = buildBucketedRows(results, columnsByCategory).map((bucketed) => ({
        createdAt: now,
        payload: bucketed,
        metadata: {
          source: "sql" as const,
          ...(sqlTemplateId ? { id: sqlTemplateId } : {}),
        },
      }));

      const res = await fetch(`/api/projects/${projectId}/queues/${selectedQueue.id}/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(items),
      });

      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        throw new Error(errMessage ?? "Failed to export to labeling queue");
      }

      track("sql_editor", "exported_to_queue", { count: items.length });
      toast({
        title: "Exported to labeling queue",
        description: (
          <span>
            Successfully added {items.length} items to queue.{" "}
            <Link className="text-primary" href={`/project/${projectId}/labeling-queues/${selectedQueue.id}`}>
              Go to queue.
            </Link>
          </span>
        ),
      });

      setIsExportDialogOpen(false);
    } catch (err) {
      toast({
        title: "Failed to export to labeling queue",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  }, [columnsByCategory, projectId, results, selectedQueue, sqlTemplateId, toast]);

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <Dialog open={isExportDialogOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-4xl bg-background">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle>Export SQL Results to Labeling Queue</DialogTitle>
          <Button
            onClick={exportToQueue}
            disabled={
              isExporting ||
              !selectedQueue ||
              (columnsByCategory.data.length === 0 && columnsByCategory.target.length === 0)
            }
          >
            {isExporting && <Loader2 className="mr-2 animate-spin w-4 h-4" />}
            Export to Queue
          </Button>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-4">
          <QueueSelect onChange={(queue) => setSelectedQueue(queue)} />
          <ColumnAssignmentDnd
            value={columnsByCategory}
            onChange={setColumnsByCategory}
            description="Drag and drop columns into Data, Target (what labelers will edit), or Metadata"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ExportSqlDialog({
  results,
  sqlQuery,
  sqlTemplateId,
  children,
}: PropsWithChildren<ExportResultsDialogProps>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children || (
          <Button disabled={!sqlQuery?.trim()} variant="secondary" className="w-fit px-2">
            <Database className="size-3.5 mr-2" />
            Export
            <ChevronDown className="size-3.5 ml-2" />
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <ExportDatasetDialog results={results}>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <Database className="w-4 h-4 mr-2" />
            Export to Dataset
          </DropdownMenuItem>
        </ExportDatasetDialog>
        <ExportJobDialog sqlQuery={sqlQuery}>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <Database className="w-4 h-4 mr-2" />
            Export to Dataset as Job
          </DropdownMenuItem>
        </ExportJobDialog>
        <ExportQueueDialog results={results} sqlTemplateId={sqlTemplateId}>
          <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
            <ListChecks className="w-4 h-4 mr-2" />
            Export to Labeling Queue
          </DropdownMenuItem>
        </ExportQueueDialog>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
