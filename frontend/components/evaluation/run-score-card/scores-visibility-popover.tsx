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
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import { Button } from "@/components/ui/button";
import { ColumnsMenuItem } from "@/components/ui/columns-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ScoresVisibilityPopoverProps {
  /** Score names in their current (persisted) display order. */
  scoreOrder: string[];
  /** Score names currently hidden from the cards row. */
  hiddenScores: string[];
  onToggle: (name: string) => void;
  onReorder: (nextOrder: string[]) => void;
}

// Popover (styled like the table's Columns menu) listing every score with a
// drag handle to reorder + a toggle to show/hide its aggregate card. Both the
// order and the toggle drive the cards row above the table.
export default function ScoresVisibilityPopover({
  scoreOrder,
  hiddenScores,
  onToggle,
  onReorder,
}: ScoresVisibilityPopoverProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (active && over && active.id !== over.id) {
      const oldIndex = scoreOrder.indexOf(active.id as string);
      const newIndex = scoreOrder.indexOf(over.id as string);
      if (oldIndex !== -1 && newIndex !== -1) {
        onReorder(arrayMove(scoreOrder, oldIndex, newIndex));
      }
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button icon="slidersHorizontal" variant="secondary">
          Scores
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 overflow-hidden p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
        <ScrollArea type="always" className="max-h-72">
          <div className="flex flex-col p-1">
            {scoreOrder.length === 0 ? (
              <div className="px-2 py-1.5 text-xs text-muted-foreground">No scores yet</div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToVerticalAxis]}
              >
                <SortableContext items={scoreOrder} strategy={verticalListSortingStrategy}>
                  {scoreOrder.map((name) => (
                    <ColumnsMenuItem
                      key={name}
                      id={name}
                      label={name}
                      isVisible={!hiddenScores.includes(name)}
                      isLocked={false}
                      onToggleVisibility={onToggle}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
