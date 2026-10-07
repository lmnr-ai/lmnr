"use client";

import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { type Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";
import { type Span } from "@/lib/traces/types";

import DatasetSelect from "../ui/dataset-select";

interface ExportSpansDialogProps {
  span: Span;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function ExportSpansDialog({ span, open, onOpenChange }: ExportSpansDialogProps) {
  const { projectId } = useParams();
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const { toast } = useToast();

  const setOpen = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      if (!next) {
        setSelectedDataset(null);
        setIsLoading(false);
      }
    },
    [onOpenChange]
  );

  const exportSpan = useCallback(async () => {
    try {
      if (!selectedDataset) {
        return;
      }
      setIsLoading(true);

      const res = await fetch(`/api/projects/${projectId}/spans/${span.spanId}/export`, {
        method: "POST",
        body: JSON.stringify({
          datasetId: selectedDataset.id,
          metadata: {},
        }),
      });

      if (!res.ok) {
        toast({
          description: "Failed to export span. Please try again.",
          variant: "destructive",
        });
      } else {
        track("datasets", "span_added", { source: "span_view" });
        toast({
          title: `Added span to dataset`,
          description: (
            <span>
              Successfully added to dataset.{" "}
              <Link className="text-primary" href={`/project/${projectId}/datasets/${selectedDataset.id}`}>
                Go to dataset.
              </Link>
            </span>
          ),
        });
      }
      setOpen(false);
    } catch (e) {
      toast({
        title: e instanceof Error ? e.message : "Failed to export span. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectId, selectedDataset, setOpen, span.spanId, toast]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>Add to dataset</DialogTitle>
        </DialogHeader>
        <div className="grid gap-2">
          <Label>Dataset</Label>
          <DatasetSelect value={selectedDataset?.id} onChange={(dataset) => setSelectedDataset(dataset)} />
        </div>
        <DialogFooter>
          <Button handleEnter onClick={exportSpan} disabled={!selectedDataset || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Add to dataset
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
