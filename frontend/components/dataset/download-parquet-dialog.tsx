import { Download, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useState } from "react";
import useSWR from "swr";

import { CopyButton } from "@/components/ui/copy-button.tsx";
import { ExportJob } from "@/lib/actions/dataset-export-jobs";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

interface DownloadParquetDialogProps {
  datasetId: string;
  publicApiBaseUrl?: string;
}

type Parquet = {
  path: string;
  fileName: string;
  datasetId: string;
  projectId: string;
  size: number;
  id: string;
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

function LoadingState() {
  return (
    <div className="flex flex-col items-center py-4">
      <Loader2 className="size-8 animate-spin text-muted-foreground" />
    </div>
  );
}

function ExportInProgressBanner() {
  return (
    <div className="flex items-center justify-between p-3 bg-muted rounded-md">
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Export in progress...</span>
      </div>
    </div>
  );
}

interface ParquetTableProps {
  parquets: Parquet[];
  downloadingIndex: number | null;
  onDownload: (index: number, fileName: string) => void;
  publicApiBaseUrl?: string;
  datasetId: string;
}

function ParquetTable({ parquets, downloadingIndex, onDownload, publicApiBaseUrl, datasetId }: ParquetTableProps) {
  return (
    <div className="flex flex-1 border rounded-md overflow-auto">
      <Table className="table-fixed">
        <TableHeader>
          <TableRow>
            <TableHead className="h-12 px-4">Name</TableHead>
            <TableHead className="h-12 px-4">Size</TableHead>
            <TableHead className="h-12 px-4 w-32 text-center">Download</TableHead>
            <TableHead className="h-12 px-4 w-32 text-center">API URL</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {parquets.map((parquet, idx) => (
            <TableRow key={parquet.id || idx}>
              <TableCell className="px-4 text-sm font-medium truncate" title={parquet.fileName}>
                {parquet.fileName}
              </TableCell>
              <TableCell className="px-4 text-sm text-muted-foreground">{formatFileSize(parquet.size)}</TableCell>
              <TableCell className="px-4">
                <div className="flex justify-center">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => onDownload(idx, parquet.fileName)}
                    disabled={downloadingIndex === idx}
                  >
                    {downloadingIndex === idx ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Download className="size-4" />
                    )}
                  </Button>
                </div>
              </TableCell>
              <TableCell className="px-4">
                <div className="flex justify-center">
                  <CopyButton
                    size="icon"
                    text={`${publicApiBaseUrl ?? "https://api.lmnr.ai"}/v1/datasets/${datasetId}/parquets/${parquet.fileName}`}
                  />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface StartExportButtonProps {
  isLoading: boolean;
  hasError: boolean;
  onStart: () => void;
}

function StartExportButton({ isLoading, hasError, onStart }: StartExportButtonProps) {
  return (
    <div className="flex flex-col items-start gap-4">
      {hasError && <div className="text-sm text-destructive">Previous export failed. Please try again.</div>}
      <Button className="h-8" disabled={isLoading} variant="outline" onClick={onStart}>
        {isLoading && <Loader2 className="size-4 animate-spin text-muted-foreground mr-2" />}
        Start export job
      </Button>
    </div>
  );
}

export default function DownloadParquetDialog({ datasetId, publicApiBaseUrl }: DownloadParquetDialogProps) {
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [isExportLoading, setIsExportLoading] = useState(false);
  const { toast } = useToast();

  const { data: parquets, isLoading: isLoadingParquets } = useSWR<Parquet[]>(
    isDialogOpen ? `/api/projects/${projectId}/datasets/${datasetId}/parquets` : null,
    swrFetcher
  );

  const {
    data: exportJob,
    mutate: mutateExportJob,
    isLoading: isLoadingJob,
  } = useSWR<ExportJob | null>(
    isDialogOpen ? `/api/projects/${projectId}/datasets/${datasetId}/export-jobs` : null,
    swrFetcher
  );

  const hasParquets = Boolean(parquets?.length);
  const isJobInProgress = exportJob?.status === "in_progress";
  const isJobError = exportJob?.status === "error";
  const isLoading = isLoadingParquets || isLoadingJob;

  const downloadFile = useCallback(
    async (index: number, fileName: string) => {
      try {
        setDownloadingIndex(index);

        const url = `/api/projects/${projectId}/datasets/${datasetId}/parquets/${index}`;
        const link = document.createElement("a");
        link.href = url;
        link.download = fileName;
        link.style.display = "none";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast({
          title: "Download started",
          description: `${fileName} should start downloading shortly`,
        });
      } catch (error) {
        toast({
          title: "Download failed",
          description: "Please try again later",
          variant: "destructive",
        });
      } finally {
        setTimeout(() => setDownloadingIndex(null), 1000);
      }
    },
    [datasetId, projectId, toast]
  );

  const startExportJob = useCallback(async () => {
    try {
      setIsExportLoading(true);
      const response = await fetch(`/api/projects/${projectId}/datasets/${datasetId}/parquets`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to start export job");
      }

      const job = (await response.json()) as Omit<ExportJob, "createdAt">;
      await mutateExportJob({ ...job, createdAt: new Date().toISOString() }, false);

      toast({
        title: "Export job started",
        description: "Your dataset is being exported to parquet files",
      });
    } catch (error) {
      toast({
        title: "Error starting export job",
        description: "Please try again later",
        variant: "destructive",
      });
    } finally {
      setIsExportLoading(false);
    }
  }, [datasetId, mutateExportJob, projectId, toast]);

  const renderContent = () => {
    if (isLoading) {
      return <LoadingState />;
    }

    if (isJobInProgress && !hasParquets) {
      return <ExportInProgressBanner />;
    }

    if (hasParquets && parquets) {
      return (
        <div className="flex flex-col gap-4">
          {isJobInProgress && <ExportInProgressBanner />}
          <ParquetTable
            parquets={parquets}
            downloadingIndex={downloadingIndex}
            onDownload={downloadFile}
            publicApiBaseUrl={publicApiBaseUrl}
            datasetId={datasetId}
          />
        </div>
      );
    }

    return <StartExportButton isLoading={isExportLoading} hasError={isJobError} onStart={startExportJob} />;
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        <Button icon="rows4" variant="secondary">
          Parquets
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Parquet Files</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">Download your dataset as parquet files.</p>
        {renderContent()}
      </DialogContent>
    </Dialog>
  );
}
