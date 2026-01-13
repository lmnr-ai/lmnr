import { Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { type PropsWithChildren, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { type Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { type Span } from "@/lib/traces/types";

import DatasetSelect from "../ui/dataset-select";

interface ExportSpansDialogProps {
  span: Span;
}

export default function ExportSpansPopover({ children, span }: PropsWithChildren<ExportSpansDialogProps>) {
  const { projectId } = useParams();
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);

  const { toast } = useToast();

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
  }, [projectId, selectedDataset, span.spanId, toast]);

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) {
            setSelectedDataset(null);
            setIsLoading(false);
          }
        }}
      >
        <PopoverTrigger asChild>
          {children || (
            <Button icon="database" size="sm" variant="secondary">
              <span>Add to dataset</span>
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end" side="bottom">
          <div className="flex flex-col space-y-4">
            <span className="font-medium">Export span to dataset</span>
            <DatasetSelect onChange={(dataset) => setSelectedDataset(dataset)} />
            <Button className="ml-auto" onClick={exportSpan} disabled={!selectedDataset || isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Add to dataset
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
