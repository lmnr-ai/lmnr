import SortableHeaderCell from "./sortable-header-cell";

export const CHEVRON_COLUMN_WIDTH_CLASSNAME = "w-10";
export const TIME_RANGE_COLUMN_WIDTH_CLASSNAME = "w-54";
export const SESSION_ID_COLUMN_WIDTH_CLASSNAME = "w-84";
export const DURATION_COLUMN_WIDTH_CLASSNAME = "w-32";
export const TOKENS_COLUMN_WIDTH_CLASSNAME = "w-32";
export const COST_COLUMN_WIDTH_CLASSNAME = "w-32";
export const COUNT_COLUMN_WIDTH_CLASSNAME = "w-28";

export type SessionSortColumn = "start_time" | "duration" | "total_tokens" | "total_cost" | "trace_count";
export type SortDirection = "ASC" | "DESC";

interface SessionTableHeaderProps {
  sortColumn?: SessionSortColumn;
  sortDirection?: SortDirection;
  onSort: (column: SessionSortColumn, direction: SortDirection) => void;
  onClearSort: () => void;
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
        label="Trace count"
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
