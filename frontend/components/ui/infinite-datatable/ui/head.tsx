import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { flexRender, type Header, type RowData } from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Check, ChevronDown, EyeOff } from "lucide-react";
import React, { type CSSProperties } from "react";
import { useStore } from "zustand";

import { TableHead } from "@/components/ui/table.tsx";
import { cn } from "@/lib/utils.ts";

import { Button } from "../../button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../dropdown-menu.tsx";
import { useDataTableStore } from "../model/datatable-store.tsx";

interface DraggableTableHeaderProps<TData extends RowData> {
  header: Header<TData, unknown>;
  onHideColumn?: (columnId: string) => void;
  isControllable: boolean;
}

export function InfiniteTableHead<TData extends RowData>({
  header,
  onHideColumn,
  isControllable = true,
}: DraggableTableHeaderProps<TData>) {
  const columnId = header.column.id;
  const store = useDataTableStore();
  const draggingColumnId = useStore(store, (state) => state.draggingColumnId);
  const { attributes, isDragging, listeners, setNodeRef, transform, transition } = useSortable({
    id: columnId || "",
    disabled: !columnId, // Disable drag if no id
  });

  const isOtherDragging = draggingColumnId && draggingColumnId !== columnId;

  const transformValue = CSS.Translate.toString(transform);
  const scaleValue = isDragging ? "scale(1.02)" : "";
  const combinedTransform =
    transformValue && scaleValue ? `${transformValue} ${scaleValue}` : transformValue || scaleValue || undefined;

  const style: CSSProperties = {
    opacity: isDragging ? 0.4 : isOtherDragging ? 0.9 : 1,
    position: "relative",
    transform: combinedTransform,
    transition:
      transition ||
      (isOtherDragging
        ? "transform 0.3s cubic-bezier(0.2, 0, 0, 1), opacity 0.2s ease-out"
        : "transform 0.2s ease-out, opacity 0.2s ease-out"),
    whiteSpace: "nowrap",
    width: header.column.getSize(),
    zIndex: isDragging ? 50 : isOtherDragging ? 1 : 0,
  };
  return (
    <TableHead
      colSpan={header.colSpan}
      style={{
        ...style,
        height: 32,
        width: header.getSize(),
        minWidth: header.getSize(),
        display: "flex",
      }}
      className={cn("m-0 relative text-secondary-foreground truncate hover:bg-transparent", isDragging && "shadow-lg")}
      key={header.id}
      ref={setNodeRef}
    >
      <div
        {...(isControllable ? { ...attributes, ...listeners } : {})}
        className={cn(
          "absolute inset-0 h-full flex justify-between items-center group text-ellipsis overflow-hidden whitespace-nowrap text-secondary-foreground pl-4 pointer-events-auto",
          isControllable ? "cursor-grab active:cursor-grabbing" : "cursor-default"
        )}
      >
        <div className="text-ellipsis overflow-hidden whitespace-nowrap text-secondary-foreground">
          {flexRender(header.column.columnDef.header, header.getContext())}
        </div>
        <div
          className={cn(
            "transition-opacity duration-150",
            header.column.getIsSorted() ? "opacity-100" : "opacity-0 group-hover:opacity-100"
          )}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {isControllable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-fit cursor-pointer">
                  {header.column.getIsSorted() === "asc" ? (
                    <ArrowUp className="size-3" />
                  ) : header.column.getIsSorted() === "desc" ? (
                    <ArrowDown className="size-3" />
                  ) : (
                    <ChevronDown className="size-3" />
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
              >
                {header.column.getCanSort() && (
                  <>
                    <DropdownMenuItem
                      className="flex w-full items-center"
                      isActive={header.column.getIsSorted() === "asc"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (header.column.getIsSorted() === "asc") {
                          header.column.clearSorting();
                        } else {
                          header.column.toggleSorting(false);
                        }
                      }}
                    >
                      {header.column.getIsSorted() === "asc" ? (
                        <Check className="size-3.5 text-primary-foreground" />
                      ) : (
                        <ArrowUp className="size-3.5" />
                      )}
                      Sort ascending
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="flex w-full items-center"
                      isActive={header.column.getIsSorted() === "desc"}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (header.column.getIsSorted() === "desc") {
                          header.column.clearSorting();
                        } else {
                          header.column.toggleSorting(true);
                        }
                      }}
                    >
                      {header.column.getIsSorted() === "desc" ? (
                        <Check className="size-3.5 text-primary-foreground" />
                      ) : (
                        <ArrowDown className="size-3.5" />
                      )}
                      Sort descending
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                  </>
                )}
                <DropdownMenuItem
                  className="flex w-full items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHideColumn?.(header.column.id);
                  }}
                >
                  <EyeOff className="size-3.5" />
                  Hide column
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        <div
          className={cn(
            "group-hover:bg-blue-300 group-hover:w-[2px] absolute w-px bottom-0 top-0 right-0 h-full cursor-col-resize transition-colors",
            header.column.getIsResizing() ? "bg-blue-400" : "bg-transparent"
          )}
          onMouseDown={(e) => {
            e.stopPropagation();
            header.getResizeHandler()(e);
          }}
          onPointerDown={(e) => {
            e.stopPropagation();
          }}
          onDoubleClick={() => header.column.resetSize()}
        />
      </div>
    </TableHead>
  );
}

export const DraggingTableHeadOverlay = <TData,>({ header }: { header: Header<TData, unknown> | null }) => {
  if (!header) return null;

  return (
    <div
      className="bg-secondary border rounded-lg shadow-2xl opacity-95 rotate-2 scale-105"
      style={{
        width: header.getSize(),
        height: 32,
      }}
    >
      <div className="h-full flex items-center justify-between px-4 text-xs text-secondary-foreground truncate">
        <div className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</div>
      </div>
    </div>
  );
};
