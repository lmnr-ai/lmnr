'use client';

import {
  closestCenter,
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { Database, GripVertical, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import DatasetSelect from '@/components/ui/dataset-select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Dataset } from '@/lib/dataset/types';
import { eventEmitter } from '@/lib/event-emitter';
import { useToast } from '@/lib/hooks/use-toast';
import { cn } from '@/lib/utils';

interface ExportResultsDialogProps {
  results: any[] | null;
  projectId: string;
  trigger?: React.ReactNode;
}

type ColumnCategory = 'data' | 'target' | 'metadata';

interface DraggableItemProps {
  column: string;
}

function DraggableItem({ column }: DraggableItemProps) {
  return (
    <div className="flex items-center p-2 border rounded bg-card shadow-md">
      <GripVertical className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
      <span className="truncate">{column}</span>
    </div>
  );
}

interface DraggableColumnProps {
  column: string;
  category: ColumnCategory;
  onRemove: (column: string) => void;
}

function DraggableColumn({ column, category, onRemove }: DraggableColumnProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `${category}-${column}`,
    data: {
      column,
      category
    }
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "mb-2",
        isDragging ? "opacity-30" : "opacity-100"
      )}
      {...listeners}
      {...attributes}
    >
      <DraggableItem column={column} />
    </div>
  );
}

function CategoryDropZone({
  title,
  items,
  category,
  onRemoveItem
}: {
  title: string;
  items: string[];
  category: ColumnCategory;
  onRemoveItem: (column: string) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({
    id: category,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex-1 p-4 border rounded-md transition-colors",
        isOver ? "bg-muted" : "bg-card"
      )}
    >
      <h3 className="mb-3 font-medium">{title}</h3>
      <div className="min-h-[150px]">
        {items.map((column) => (
          <DraggableColumn
            key={`${category}-${column}`}
            column={column}
            category={category}
            onRemove={onRemoveItem}
          />
        ))}
      </div>
    </div>
  );
}

export default function ExportResultsDialog({ results, projectId, trigger }: ExportResultsDialogProps) {
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [selectedDataset, setSelectedDataset] = useState<Dataset | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [columnsByCategory, setColumnsByCategory] = useState<Record<ColumnCategory, string[]>>({
    data: [],
    target: [],
    metadata: []
  });
  const [activeId, setActiveId] = useState<string | null>(null);
  const { toast } = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 50,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const activeDragData = useMemo(() => {
    if (!activeId) return null;
    const [category, column] = activeId.split('-');
    return { column, category: category as ColumnCategory };
  }, [activeId]);

  // Initialize column mappings whenever dialog opens or results change
  const handleDialogOpen = (open: boolean) => {
    if (open && results && results.length > 0) {
      // Initialize all columns to the data category
      const allColumns = Object.keys(results[0]);
      setColumnsByCategory({
        data: allColumns,
        target: [],
        metadata: []
      });
    } else {
      // Reset state when dialog closes
      setSelectedDataset(null);
    }

    setIsExportDialogOpen(open);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const activeData = active.data.current as { column: string, category: ColumnCategory };
      const sourceCategory = activeData.category;
      const columnName = activeData.column;
      const targetCategory = over.id as ColumnCategory;

      if (sourceCategory !== targetCategory &&
        (targetCategory === 'data' || targetCategory === 'target' || targetCategory === 'metadata')) {

        // Move the column from source category to target category
        setColumnsByCategory(prev => {
          // Remove from source
          const sourceColumns = prev[sourceCategory].filter(col => col !== columnName);

          // Add to target
          const targetColumns = [...prev[targetCategory]];
          if (!targetColumns.includes(columnName)) {
            targetColumns.push(columnName);
          }

          return {
            ...prev,
            [sourceCategory]: sourceColumns,
            [targetCategory]: targetColumns
          };
        });
      }
    }

    setActiveId(null);
  };

  const removeColumnFromCategory = (column: string, category: ColumnCategory) => {
    setColumnsByCategory(prev => ({
      ...prev,
      [category]: prev[category].filter(c => c !== column)
    }));
  };

  const exportToDataset = async () => {
    if (!selectedDataset || !results || results.length === 0) return;

    setIsExporting(true);

    try {
      // Format data points using the current column categories
      const datapoints = results.map((row: any) => {
        const newDatapoint: any = {
          data: {},
          target: {},
          metadata: {}
        };

        // Add data fields
        columnsByCategory.data.forEach(key => {
          newDatapoint.data[key] = row[key];
        });

        // Add target fields
        columnsByCategory.target.forEach(key => {
          newDatapoint.target[key] = row[key];
        });

        // Add metadata fields
        columnsByCategory.metadata.forEach(key => {
          newDatapoint.metadata[key] = row[key];
        });

        return newDatapoint;
      });

      const res = await fetch(`/api/projects/${projectId}/sql/export/${selectedDataset.id}`, {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          datapoints: datapoints
        }),
      });

      if (!res.ok) {
        throw new Error('Failed to export data');
      }

      eventEmitter.emit("mutateDatasetDatapoints");
      toast({
        title: `Exported to dataset`,
        description: (
          <span>
            Successfully exported {datapoints.length} results to dataset.{" "}
            <Link className="text-primary" href={`/project/${projectId}/datasets/${selectedDataset.id}`}>
              Go to dataset.
            </Link>
          </span>
        )
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
  };

  if (!results || results.length === 0) {
    return null;
  }

  return (
    <Dialog open={isExportDialogOpen} onOpenChange={handleDialogOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button variant="secondary" size="sm">
            <Database className="size-3.5 mr-2" />
            Export to Dataset
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-4xl bg-background">
        <DialogHeader className="p-4 border-b mb-4">
          <div className="flex flex-row justify-between items-center">
            <DialogTitle>Export SQL Results to Dataset</DialogTitle>
            <Button
              onClick={exportToDataset}
              disabled={
                isExporting ||
                !selectedDataset ||
                columnsByCategory.data.length === 0 && columnsByCategory.target.length === 0
              }
            >
              <Loader2 className={cn("mr-2 hidden", isExporting ? "animate-spin block" : "")} size={16} />
              Export to Dataset
            </Button>
          </div>
        </DialogHeader>
        <div className="flex flex-col space-y-6 overflow-auto max-h-[80vh] p-4">
          <div className="flex flex-col space-y-2">
            <Label className="text-lg font-medium">Select Dataset</Label>
            <DatasetSelect onChange={(dataset) => setSelectedDataset(dataset)} />
          </div>

          <div className="flex flex-col space-y-2">
            <Label className="text-lg font-medium">Assign columns to dataset fields</Label>
            <p className="text-sm text-muted-foreground mb-2">
              Drag and drop columns between categories
            </p>

            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={handleDragStart}
              onDragEnd={handleDragEnd}
            >
              <div className="grid grid-cols-3 gap-4">
                <CategoryDropZone
                  title="Data"
                  items={columnsByCategory.data}
                  category="data"
                  onRemoveItem={(column) => removeColumnFromCategory(column, 'data')}
                />
                <CategoryDropZone
                  title="Target"
                  items={columnsByCategory.target}
                  category="target"
                  onRemoveItem={(column) => removeColumnFromCategory(column, 'target')}
                />
                <CategoryDropZone
                  title="Metadata"
                  items={columnsByCategory.metadata}
                  category="metadata"
                  onRemoveItem={(column) => removeColumnFromCategory(column, 'metadata')}
                />
              </div>

              <DragOverlay dropAnimation={null} >
                {activeDragData ? (
                  <DraggableItem column={activeDragData.column} />
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
