import { Row, RowData, Table, TableOptions } from "@tanstack/react-table";
import { VirtualItem, Virtualizer } from "@tanstack/react-virtual";
import { ReactNode, RefObject } from "react";

export interface InfiniteDataTableProps<TData extends RowData>
  extends Omit<Partial<TableOptions<TData>>, "data" | "columns"> {
  data: TData[];
  columns: TableOptions<TData>["columns"];

  // Infinite scroll props
  hasMore: boolean;
  isFetching: boolean;
  isLoading: boolean;
  fetchNextPage: () => void;
  totalItemsCount?: number;

  estimatedRowHeight?: number;
  overscan?: number;

  onRowClick?: (row: Row<TData>) => void;
  focusedRowId?: string | null;

  selectionPanel?: (selectedRowIds: string[]) => ReactNode;

  className?: string;
  childrenClassName?: string;
  scrollContentClassName?: string;

  emptyRow?: ReactNode;
  loadingRow?: ReactNode;
  error?: Error | null;
}

export interface InfiniteDataTableHeaderProps<TData extends RowData> {
  table: Table<TData>;
}

export interface InfiniteDataTableBodyProps<TData extends RowData> {
  table: Table<TData>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  virtualItems: VirtualItem[];
  isLoading: boolean;
  hasMore: boolean;
  onRowClick?: (row: Row<TData>) => void;
  focusedRowId?: string | null;
  loadMoreRef: RefObject<HTMLTableRowElement | null>;
  emptyRow?: ReactNode;
  loadingRow?: ReactNode;
  error?: Error | null;
}

export interface InfiniteDataTableRowProps<TData extends RowData> {
  virtualRow: VirtualItem;
  row: Row<TData>;
  rowVirtualizer: Virtualizer<HTMLDivElement, Element>;
  onRowClick?: (row: Row<TData>) => void;
  focusedRowId?: string | null;
}

export interface SelectionPanelProps {
  selectedRowIds: string[];
  onClearSelection: () => void;
  selectionPanel?: (selectedRowIds: string[]) => ReactNode;
}

export interface CheckboxColumnOptions {
  onDeselectAll?: () => void;
}
