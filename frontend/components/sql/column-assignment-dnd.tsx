"use client";

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useCallback } from "react";

import { CategoryDropZone, type ColumnCategory } from "@/components/sql/dnd-components";
import { Label } from "@/components/ui/label";

export type CategorizedColumns = Record<ColumnCategory, string[]>;

export const EMPTY_CATEGORIZED_COLUMNS: CategorizedColumns = {
  data: [],
  target: [],
  metadata: [],
};

/**
 * Initialise every available column under `data`. Used by both the dataset
 * and queue export dialogs on open — keeps the "data" bucket as the catch-all
 * starting point so users only drag the columns they care about elsewhere.
 */
export const buildInitialColumns = (columns: string[]): CategorizedColumns => ({
  data: [...columns],
  target: [],
  metadata: [],
});

interface ColumnAssignmentDndProps {
  value: CategorizedColumns;
  onChange: (next: CategorizedColumns) => void;
  /**
   * Override category labels (e.g. queue export wants the same bucket names
   * as dataset export — they share the queue item's `{data, target, metadata}`
   * shape). Defaults below match the dataset wording.
   */
  titles?: Partial<Record<ColumnCategory, string>>;
  description?: string;
}

const DEFAULT_TITLES: Record<ColumnCategory, string> = {
  data: "Data",
  target: "Target",
  metadata: "Metadata",
};

export default function ColumnAssignmentDnd({
  value,
  onChange,
  titles,
  description = "Drag and drop columns between categories",
}: ColumnAssignmentDndProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 12 } }),
    useSensor(KeyboardSensor)
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const activeData = active.data.current as { column: string; category: ColumnCategory };
      const sourceCategory = activeData.category;
      const columnName = activeData.column;
      const targetCategory = over.id as ColumnCategory;

      if (sourceCategory === targetCategory) return;
      if (targetCategory !== "data" && targetCategory !== "target" && targetCategory !== "metadata") {
        return;
      }

      const sourceColumns = value[sourceCategory].filter((c) => c !== columnName);
      const targetColumns = value[targetCategory].includes(columnName)
        ? value[targetCategory]
        : [...value[targetCategory], columnName];

      onChange({
        ...value,
        [sourceCategory]: sourceColumns,
        [targetCategory]: targetColumns,
      });
    },
    [onChange, value]
  );

  const removeColumn = useCallback(
    (column: string, category: ColumnCategory) => {
      onChange({
        ...value,
        [category]: value[category].filter((c) => c !== column),
      });
    },
    [onChange, value]
  );

  const resolved = { ...DEFAULT_TITLES, ...titles };

  return (
    <div className="flex flex-col gap-2 flex-1 overflow-auto max-h-[80vh] h-full">
      <div>
        <Label className="text-lg font-medium">Assign columns</Label>
        <p className="text-sm text-muted-foreground mb-2">{description}</p>
      </div>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-3 gap-4">
          <CategoryDropZone
            title={resolved.data}
            items={value.data}
            category="data"
            onRemoveItem={(column) => removeColumn(column, "data")}
          />
          <CategoryDropZone
            title={resolved.target}
            items={value.target}
            category="target"
            onRemoveItem={(column) => removeColumn(column, "target")}
          />
          <CategoryDropZone
            title={resolved.metadata}
            items={value.metadata}
            category="metadata"
            onRemoveItem={(column) => removeColumn(column, "metadata")}
          />
        </div>
      </DndContext>
    </div>
  );
}
