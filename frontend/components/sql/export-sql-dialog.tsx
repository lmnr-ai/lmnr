"use client";

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { ChevronDown, Database, Loader2 } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";

import { CategoryDropZone, ColumnCategory } from "@/components/sql/dnd-components";
import { Button } from "@/components/ui/button";
import DatasetSelect from "@/components/ui/dataset-select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";

interface ExportResultsDialogProps {
  results: Record<string, any>[] | null;
  sqlQuery: string;
}

function ExportDatasetDialog({ results, children }: PropsWithChildren<Pick<ExportResultsDialogProps, "results">>) {
  const { projectId } = useParams();
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [columnsByCategory, setColumnsByCategory] = useState<Record<ColumnCategory, string[]>>({
    data: [],
    target: [],
    metadata: [],
  });
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 12,
      },
    }),
    useSensor(KeyboardSensor)
  );

  // Initialize column mappings whenever dialog opens or results change
  const handleDialogOpen = (open: boolean) => {
    if (open && results && results.length > 0) {
      const allColumns = Object.keys(results[0]);
      setColumnsByCategory({
        data: allColumns,
        target: [],
        metadata: [],
      });
    } else {
      setSelectedDataset(null);
    }

    setIsExportDialogOpen(open);
  };

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeData = active.data.current as { column: string; category: ColumnCategory };
      const sourceCategory = activeData.category;
      const columnName = activeData.column;
      const targetCategory = over.id as ColumnCategory;

      if (
        sourceCategory !== targetCategory &&
        (targetCategory === "data" || targetCategory === "target" || targetCategory === "metadata")
      ) {
        // Move the column from source category to target category
        setColumnsByCategory((prev) => {
          // Remove from source
          const sourceColumns = prev[sourceCategory].filter((col) => col !== columnName);

          // Add to target
          const targetColumns = [...prev[targetCategory]];
          if (!targetColumns.includes(columnName)) {
            targetColumns.push(columnName);
          }

          return {
            ...prev,
            [sourceCategory]: sourceColumns,
            [targetCategory]: targetColumns,
          };
        });
      }
    }
  }, []);

  const removeColumnFromCategory = useCallback((column: string, category: ColumnCategory) => {
    setColumnsByCategory((prev) => ({
      ...prev,
      [category]: prev[category].filter((c) => c !== column),
    }));
  }, []);

  const exportToDataset = useCallback(async () => {
    if (!selectedDataset || !results || results.length === 0) return;

    setIsExporting(true);

    try {
      // Format data points using the current column categories
      const datapoints = results.map((row: any) => {
        const newDatapoint: any = {
          data: {},
          target: {},
          metadata: {},
        };

        // Add data fields
        columnsByCategory.data.forEach((key) => {
          newDatapoint.data[key] = row[key];
        });

        // Add target fields
        columnsByCategory.target.forEach((key) => {
          newDatapoint.target[key] = row[key];
        });

        // Add metadata fields
        columnsByCategory.metadata.forEach((key) => {
          newDatapoint.metadata[key] = row[key];
        });

        return newDatapoint;
      });

      const res = await fetch(`/api/projects/${projectId}/sql/export/${selectedDataset.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          datapoints: datapoints,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to export data");
      }

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
  }, [
    columnsByCategory.data,
    columnsByCategory.metadata,
    columnsByCategory.target,
    projectId,
    results,
    selectedDataset,
    toast,
  ]);

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
          <div className="flex flex-col gap-2 flex-1 overflow-auto max-h-[80vh] h-full">
            <div>
              <Label className="text-lg font-medium">Assign columns to dataset fields</Label>
              <p className="text-sm text-muted-foreground mb-2">Drag and drop columns between categories</p>
            </div>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <div className="grid grid-cols-3 gap-4">
                <CategoryDropZone
                  title="Data"
                  items={columnsByCategory.data}
                  category="data"
                  onRemoveItem={(column) => removeColumnFromCategory(column, "data")}
                />
                <CategoryDropZone
                  title="Target"
                  items={columnsByCategory.target}
                  category="target"
                  onRemoveItem={(column) => removeColumnFromCategory(column, "target")}
                />
                <CategoryDropZone
                  title="Metadata"
                  items={columnsByCategory.metadata}
                  category="metadata"
                  onRemoveItem={(column) => removeColumnFromCategory(column, "metadata")}
                />
              </div>
            </DndContext>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function ExportSqlDialog({ results, sqlQuery, children }: PropsWithChildren<ExportResultsDialogProps>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children || (
          <Button disabled={!sqlQuery?.trim()} variant="secondary" className="w-fit px-2">
            <Database className="size-3.5 mr-2" />
            Export to Dataset
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
        {/*NOTE: uncomment when data exporter is ready to operate.*/}
        {/*<ExportJobDialog sqlQuery={sqlQuery}>*/}
        {/*  <DropdownMenuItem onSelect={(e) => e.preventDefault()}>*/}
        {/*    <Database className="w-4 h-4 mr-2" />*/}
        {/*    Export to Dataset as Job*/}
        {/*  </DropdownMenuItem>*/}
        {/*</ExportJobDialog>*/}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
