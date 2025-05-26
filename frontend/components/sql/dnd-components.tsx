import { useDraggable, useDroppable } from "@dnd-kit/core";
import { GripVertical, X } from "lucide-react";
import { memo } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ColumnCategory = "data" | "target" | "metadata";

interface DraggableColumnProps {
  column: string;
  category: ColumnCategory;
  onRemove: () => void;
}

const PureDraggableColumn = ({ column, category, onRemove }: DraggableColumnProps) => {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging, transform } = useDraggable({
    id: `${category}-${column}`,
    data: {
      column,
      category,
    },
  });

  const style = transform
    ? {
      transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
    }
    : undefined;

  return (
    <div
      {...attributes}
      style={style}
      ref={setNodeRef}
      className={cn("mb-2", isDragging ? "opacity-30" : "opacity-100")}
    >
      <div className="flex items-center p-1 border rounded bg-card shadow-md">
        <Button ref={setActivatorNodeRef} {...listeners} className="p-1 h-fit" variant="ghost">
          <GripVertical className="h-4 w-4 mr-2 flex-shrink-0 text-muted-foreground" />
        </Button>
        <span className="truncate font-mono text-sm">{column}</span>
        <Button onClick={onRemove} variant="ghost" className="ml-auto p-1 h-fit">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
};

const PureCategoryDropZone = ({
  title,
  items,
  category,
  onRemoveItem,
}: {
  title: string;
  items: string[];
  category: ColumnCategory;
  onRemoveItem: (column: string) => void;
}) => {
  const { isOver, setNodeRef } = useDroppable({
    id: category,
  });

  return (
    <div
      ref={setNodeRef}
      className={cn("flex-1 p-4 border rounded-md transition-colors", isOver ? "bg-muted" : "bg-card")}
    >
      <h3 className="mb-3 font-medium">{title}</h3>
      <div className="min-h-44">
        {items.map((column) => (
          <DraggableColumn
            key={`${category}-${column}`}
            column={column}
            category={category}
            onRemove={() => onRemoveItem(column)}
          />
        ))}
      </div>
    </div>
  );
};

export const DraggableColumn = memo(PureDraggableColumn);
export const CategoryDropZone = memo(PureCategoryDropZone);
