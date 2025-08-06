import { CopyIcon, Download, Loader2, Rows2 } from "lucide-react";
import React, { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useProjectContext } from "@/contexts/project-context";
import { useToast } from "@/lib/hooks/use-toast";

import { Button } from "../ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

interface DownloadParquetDialogProps {
  datasetId: string;
}

// Dialog to add a single datapoint to a dataset by manually typing
export default function DownloadParquetDialog({ datasetId }: DownloadParquetDialogProps) {
  const { projectId } = useProjectContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [downloadingIndex, setDownloadingIndex] = useState<number | null>(null);
  const [parquets, setParquets] = useState<{
    path: string;
    fileName: string;
    datasetId: string;
    projectId: string;
    size: number;
    id: string;
  }[]>([]);
  const [jobStarted, setJobStarted] = useState(false);
  const { toast } = useToast();

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) {
      return `${bytes} B`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)} KB`;
    } else {
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }
  };

  const downloadFile = async (index: number, fileName: string) => {
    try {
      setDownloadingIndex(index);

      // Use browser's native streaming download by navigating directly to the URL
      // This lets the browser handle streaming without JavaScript interference
      const url = `/api/projects/${projectId}/datasets/${datasetId}/parquets/${index}`;

      // Create a temporary link and click it to trigger download
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName; // This may be overridden by Content-Disposition header
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Show success message
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
      // Reset downloading state after a short delay
      setTimeout(() => setDownloadingIndex(null), 1000);
    }
  };

  const fetchParquets = async () => {
    setIsLoading(true);

    const parquets = await fetch(`/api/projects/${projectId}/datasets/${datasetId}/parquets`);
    const parquetsData = await parquets.json();
    console.log(parquetsData);
    setParquets(parquetsData);

    setIsLoading(false);
    setIsDialogOpen(false);
  };

  const startJob = async () => {
    setJobStarted(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/datasets/${datasetId}/parquets`, {
        method: "POST",
      });
      if (!response.ok) {
        throw new Error("Failed to start export job");
      }
      const job = await response.json();
    } catch (error) {
      toast({
        title: "Error starting export job",
        description: "Please try again later",
        variant: "destructive",
      });
    }
  };
  console.log(parquets);

  return (
    <Dialog
      open={isDialogOpen}
      onOpenChange={async (open) => {
        if (open) {
          await fetchParquets();
        }
        setIsDialogOpen(open);
      }}
    >
      <DialogTrigger asChild>
        <Badge className="cursor-pointer py-1 px-2" variant="secondary">
          <Rows2 className="size-3 mr-2" />
          <span className="text-xs">Parquets</span>
        </Badge>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[900px]">
        <DialogHeader>
          <DialogTitle>Parquet Files</DialogTitle>
        </DialogHeader>

        {!jobStarted && parquets.length === 0 && (
          <div className="flex justify-center py-4">
            <Button variant="outline" onClick={startJob} disabled={isLoading || jobStarted}>
              Start export job
            </Button>
          </div>
        )}

        {jobStarted && parquets.length === 0 && (
          <div className="flex flex-col items-center py-8">
            <Loader2 className="size-8 animate-spin text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">Exporting dataset to parquet files...</p>
          </div>
        )}

        {parquets.length > 0 && (
          <div className="mt-4">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-center">Size</TableHead>
                  <TableHead className="w-[100px] text-center">Download</TableHead>
                  <TableHead className="w-[200px] text-center">API Download URL</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parquets.map((parquet, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{parquet.fileName}</TableCell>
                    <TableCell className="text-center">{formatFileSize(parquet.size)}</TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadFile(idx, parquet.fileName)}
                        disabled={downloadingIndex === idx}
                      >
                        {downloadingIndex === idx ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Download className="size-4" />
                        )}
                      </Button>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button variant="outline" size="sm" onClick={() => {
                        navigator.clipboard.writeText(`https://api.lmnr.ai/v1/datasets/${datasetId}/parquets/${parquet.fileName}`);
                        toast({
                          title: "Copied to clipboard",
                          description: "Direct download URL copied to clipboard",
                          duration: 1500,
                        });
                      }}>
                        <CopyIcon className="size-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
