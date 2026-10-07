import type { CustomColumn } from "@/components/ui/columns-menu/types";

export interface TableConfig {
  customColumns: CustomColumn[];
  columnOrder: string[];
  columnVisibility: Record<string, boolean>;
  columnSizing: Record<string, number>;
}
