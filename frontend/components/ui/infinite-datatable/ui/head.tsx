import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { flexRender, Header, RowData } from "@tanstack/react-table";
import { ChevronDown, EyeOff } from "lucide-react";
import { CSSProperties } from "react";

import { TableHead } from "@/components/ui/table";
import { cn } from "@/lib/utils";

import { Button } from "../../button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../../dropdown-menu";

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
  const { attributes, isDragging, listeners, setNodeRef, transform } = useSortable({
    id: columnId || "",
    disabled: !columnId, // Disable drag if no id
  });

  const style: CSSProperties = {
    opacity: isDragging ? 0.8 : 1,
    position: "relative",
    transform: CSS.Translate.toString(transform),
    transition: "width transform 0.2s ease-in-out",
    whiteSpace: "nowrap",
    width: header.column.getSize(),
    zIndex: isDragging ? 1 : 0,
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
      className="m-0 relative text-secondary-foreground truncate hover:bg-transparent"
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
          className="opacity-0 group-hover:opacity-100 transition-opacity duration-150"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          {isControllable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="w-fit cursor-pointer">
                  <ChevronDown className="size-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                className="relative z-50 min-w-32 overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
              >
                <DropdownMenuItem
                  className="flex w-full justify-between items-center"
                  onClick={(e) => {
                    e.stopPropagation();
                    onHideColumn?.(header.column.id);
                  }}
                >
                  <EyeOff className="size-3 mr-2" />
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
          onMouseDown={header.getResizeHandler()}
          onDoubleClick={() => header.column.resetSize()}
        />
      </div>
    </TableHead>
  );
}
