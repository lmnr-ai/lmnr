import { create } from "zustand";
import { persist } from "zustand/middleware";

interface ColumnsState {
  isChanged: boolean;
  columnVisibility: Record<string, boolean>;
  defaultColumnOrder: string[];
  columnOrder: string[];
}

interface ColumnsActions {
  setColumnVisibility: (visibility: Record<string, boolean>) => void;
  setColumnOrder: (order: string[]) => void;
  resetColumns: () => void;
}

export const useColumnsStore = create<ColumnsState & ColumnsActions>()(
  persist(
    (set) => ({
      isChanged: false,
      columnVisibility: {},
      columnOrder: [],
      defaultColumnOrder: [],
      setColumnVisibility: (visibility) => {
        set({ columnVisibility: visibility, isChanged: true });
      },
      setColumnOrder: (order) => {
        set((state) => ({
          columnOrder: order,
          isChanged: true,
          defaultColumnOrder: state.defaultColumnOrder?.length > 0 ? state.defaultColumnOrder : order,
        }));
      },
      resetColumns: () => {
        localStorage.removeItem("columns-storage");
        set((state) => {
          // Use defaultColumnOrder if available, otherwise fall back to current columnOrder
          // If both are empty, use empty array and let the table's useEffect set it
          const resetOrder =
            state.defaultColumnOrder?.length > 0
              ? [...state.defaultColumnOrder]
              : state.columnOrder?.length > 0
                ? [...state.columnOrder]
                : [];

          return {
            columnVisibility: {},
            columnOrder: resetOrder,
            isChanged: false,
            // Preserve defaultColumnOrder so it's available after page reload
            defaultColumnOrder:
              state.defaultColumnOrder?.length > 0
                ? [...state.defaultColumnOrder]
                : resetOrder.length > 0
                  ? [...resetOrder]
                  : [],
          };
        });
      },
    }),
    {
      name: "columns-storage",
      partialize: (state) => ({
        isChanged: state.isChanged,
        columnVisibility: state.columnVisibility,
        columnOrder: state.columnOrder,
        defaultColumnOrder: state.defaultColumnOrder,
      }),
    }
  )
);
