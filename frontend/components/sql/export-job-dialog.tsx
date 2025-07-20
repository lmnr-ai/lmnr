"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PropsWithChildren, useState } from "react";

import { Button } from "@/components/ui/button";
import DatasetSelect from "@/components/ui/dataset-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";

interface ExportJobDialogProps {
  sqlQuery: string;
}

export default function ExportJobDialog({ sqlQuery, children }: PropsWithChildren<ExportJobDialogProps>) {
  const { projectId } = useParams();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [batchSize, setBatchSize] = useState(1000);
  const { toast } = useToast();

  const handleDialogOpen = (open: boolean) => {
    if (!open) {
      setSelectedDataset(null);
      setBatchSize(1000);
    }
    setIsExportDialogOpen(open);
  };

  const exportToDatasetAsJob = async () => {
    if (!selectedDataset || !sqlQuery?.trim()) return;

    setIsExporting(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/sql/export-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          datasetId: selectedDataset.id,
          sqlQuery: sqlQuery,
          config: {
            batch_size: batchSize,
            clickhouse_batch_size: batchSize,
            max_retries: 3,
          },
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to export data as job");
      }

      const response = await res.json();

      toast({
        title: `Export job started`,
        description: (
          <span>
            Successfully started export job to process SQL query.{" "}
            <Link className="text-primary" href={`/project/${projectId}/datasets/${selectedDataset.id}`}>
              Go to dataset.
            </Link>
          </span>
        ),
      });

      setIsExportDialogOpen(false);
    } catch (err) {
      toast({
        title: "Failed to export data as job",
        description: err instanceof Error ? err.message : "An unexpected error occurred",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (!sqlQuery?.trim()) {
    return null;
  }

  return (
    <Dialog open={isExportDialogOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="max-w-md bg-background">
        <DialogHeader className="flex flex-row justify-between items-center">
          <DialogTitle>Export SQL Results as Job</DialogTitle>
          <Button
            onClick={exportToDatasetAsJob}
            disabled={isExporting || !selectedDataset}
          >
            {isExporting && <Loader2 className="mr-2 animate-spin w-4 h-4" />}
            Start Export Job
          </Button>
        </DialogHeader>
        <div className="flex flex-1 flex-col gap-4">
          <DatasetSelect onChange={(dataset) => setSelectedDataset(dataset)} />
          <div className="flex flex-col gap-2">
            <label htmlFor="batch-size" className="text-sm font-medium">
              Batch Size
            </label>
            <Input
              id="batch-size"
              type="number"
              value={batchSize}
              onChange={(e) => setBatchSize(Number(e.target.value))}
              min={1}
              max={10000}
              placeholder="1000"
              className="w-full"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            This will start a background job to execute your SQL query and export the results to the selected dataset.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
