import { useProjectContext } from "@/contexts/project-context";
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTrigger, DialogTitle, DialogFooter } from "../ui/dialog";
import { Button } from "../ui/button";
import DatasetSelect from "../ui/dataset-select";
import { ExportableSpanColumns } from "@/lib/traces/types";
import { Checkbox } from "../ui/checkbox";
import { Label } from "../ui/label";
import { Loader } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from "@/lib/hooks/use-toast";
import { Dataset } from "@/lib/dataset/types";


interface ExportSpansDialogProps {
  spanId: string;
}


export default function ExportSpansDialog({
  spanId
}: ExportSpansDialogProps) {
  const { projectId } = useProjectContext();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<Set<ExportableSpanColumns>>(new Set([
    ExportableSpanColumns.Name,
    ExportableSpanColumns.Input,
    ExportableSpanColumns.Output,
  ]));

  const toggleSelectedColumn = (column: ExportableSpanColumns) => {
    const newSelectedColumns = new Set(selectedColumns);
    if (newSelectedColumns.has(column)) {
      newSelectedColumns.delete(column);
    } else {
      newSelectedColumns.add(column);
    }
    setSelectedColumns(newSelectedColumns);
  };

  const { toast } = useToast();

  const exportSpan = async () => {
    if (!selectedDataset) {
      return;
    };
    setIsLoading(true);
    const res = await fetch(`/api/projects/${projectId}/spans/${spanId}/export`, {
      method: 'POST',
      body: JSON.stringify({
        datasetId: selectedDataset?.id,
        fields: Array.from(selectedColumns),
      }),
    });
    setIsLoading(false);
    setIsDialogOpen(false);
    if (!res.ok) {
      toast({
        title: 'Failed to export span',
        variant: 'destructive',
      });
    } else {
      toast({
        title: `Successfully exported span to dataset ${selectedDataset?.name}`,
      });
    }
  };

  return (
    <>
      <Dialog open={isDialogOpen} onOpenChange={open => {
        setIsDialogOpen(open)
        if (!open) {
          setSelectedDataset(null)
          setIsLoading(false)
        }
      }}>
        <DialogTrigger asChild>
          <Button variant={'outline'}>Add to dataset</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select dataset and columns</DialogTitle>
          </DialogHeader>
          <DatasetSelect onDatasetChange={(dataset) => setSelectedDataset(dataset)} />
          <div className='flex-col'>
            {(Object.values(ExportableSpanColumns)).map((column) => (
              <div key={column} className='flex items-center p-1'>
                <Checkbox
                  className='cursor-pointer'
                  id={`column-checkbox-${column}`}
                  checked={selectedColumns.has(column)}
                  onClick={() => toggleSelectedColumn(column)}
                />
                <Label htmlFor={`column-checkbox-${column}`} className='cursor-pointer pl-2'>{column}</Label>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button
              onClick={async () => await exportSpan()}
              disabled={isLoading || !selectedDataset || selectedColumns.size === 0}
            >
              <Loader className={cn('mr-2 hidden', isLoading ? 'animate-spin block' : '')} size={16} />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
