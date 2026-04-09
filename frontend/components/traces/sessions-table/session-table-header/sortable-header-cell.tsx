import { ArrowDown, ArrowUp, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

import { type SessionSortColumn, type SortDirection } from "./index";

interface SortableHeaderCellProps {
  label: string;
  column: SessionSortColumn;
  sortColumn?: SessionSortColumn;
  sortDirection?: SortDirection;
  onSort: (column: SessionSortColumn, direction: SortDirection) => void;
  onClearSort: () => void;
  className: string;
}

export default function SortableHeaderCell({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  onClearSort,
  className,
}: SortableHeaderCellProps) {
  const isActive = sortColumn === column;
  const isAsc = isActive && sortDirection === "ASC";
  const isDesc = isActive && sortDirection === "DESC";

  return (
    <div className={cn("flex items-center justify-between shrink-0 pl-4 group", className)}>
      <span className="text-xs text-secondary-foreground">{label}</span>
      <div
        className={cn(
          "transition-opacity duration-150",
          isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
        )}
      >
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="w-fit cursor-pointer h-7 px-1">
              {isAsc ? (
                <ArrowUp className="size-3" />
              ) : isDesc ? (
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
            <DropdownMenuItem
              className="flex w-full items-center"
              isActive={isAsc}
              onClick={(e) => {
                e.stopPropagation();
                if (isAsc) {
                  onClearSort();
                } else {
                  onSort(column, "ASC");
                }
              }}
            >
              {isAsc ? <Check className="size-3.5 text-primary-foreground" /> : <ArrowUp className="size-3.5" />}
              Sort ascending
            </DropdownMenuItem>
            <DropdownMenuItem
              className="flex w-full items-center"
              isActive={isDesc}
              onClick={(e) => {
                e.stopPropagation();
                if (isDesc) {
                  onClearSort();
                } else {
                  onSort(column, "DESC");
                }
              }}
            >
              {isDesc ? <Check className="size-3.5 text-primary-foreground" /> : <ArrowDown className="size-3.5" />}
              Sort descending
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}
