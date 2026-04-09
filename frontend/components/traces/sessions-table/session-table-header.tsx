import { ArrowDown, ArrowUp, Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export const CHEVRON_COLUMN_WIDTH_CLASSNAME = "w-10";
export const TIME_RANGE_COLUMN_WIDTH_CLASSNAME = "w-[220px]";
export const SESSION_ID_COLUMN_WIDTH_CLASSNAME = "w-[189px]";
export const DURATION_COLUMN_WIDTH_CLASSNAME = "w-[100px]";
export const TOKENS_COLUMN_WIDTH_CLASSNAME = "w-[100px]";
export const COST_COLUMN_WIDTH_CLASSNAME = "w-[100px]";
export const COUNT_COLUMN_WIDTH_CLASSNAME = "w-[80px]";

export type SessionSortColumn = "start_time" | "duration" | "total_tokens" | "total_cost" | "trace_count";
export type SortDirection = "ASC" | "DESC";

interface SessionTableHeaderProps {
  sortColumn?: SessionSortColumn;
  sortDirection?: SortDirection;
  onSort: (column: SessionSortColumn, direction: SortDirection) => void;
  onClearSort: () => void;
}

function SortableHeaderCell({
  label,
  column,
  sortColumn,
  sortDirection,
  onSort,
  onClearSort,
  className,
}: {
  label: string;
  column: SessionSortColumn;
  sortColumn?: SessionSortColumn;
  sortDirection?: SortDirection;
  onSort: (column: SessionSortColumn, direction: SortDirection) => void;
  onClearSort: () => void;
  className: string;
}) {
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

export default function SessionTableHeader({
  sortColumn,
  sortDirection,
  onSort,
  onClearSort,
}: SessionTableHeaderProps) {
  return (
    <div className="bg-secondary border-b flex h-9 items-center shrink-0 sticky top-0 w-full z-10">
      <div className={`shrink-0 ${CHEVRON_COLUMN_WIDTH_CLASSNAME}`} />
      <SortableHeaderCell
        label="Time"
        column="start_time"
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={onSort}
        onClearSort={onClearSort}
        className={TIME_RANGE_COLUMN_WIDTH_CLASSNAME}
      />
      <div className={`flex items-center px-4 py-0.5 shrink-0 ${SESSION_ID_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-xs text-secondary-foreground">ID</span>
      </div>
      <SortableHeaderCell
        label="Duration"
        column="duration"
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={onSort}
        onClearSort={onClearSort}
        className={DURATION_COLUMN_WIDTH_CLASSNAME}
      />
      <SortableHeaderCell
        label="Tokens"
        column="total_tokens"
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={onSort}
        onClearSort={onClearSort}
        className={TOKENS_COLUMN_WIDTH_CLASSNAME}
      />
      <SortableHeaderCell
        label="Cost"
        column="total_cost"
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={onSort}
        onClearSort={onClearSort}
        className={COST_COLUMN_WIDTH_CLASSNAME}
      />
      <SortableHeaderCell
        label="Count"
        column="trace_count"
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={onSort}
        onClearSort={onClearSort}
        className={COUNT_COLUMN_WIDTH_CLASSNAME}
      />
      <div className="flex-1 min-w-0" />
    </div>
  );
}
