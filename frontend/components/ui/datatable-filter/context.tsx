import { createContext, Dispatch, PropsWithChildren, SetStateAction, useContext, useMemo, useState } from "react";

import { DatatableFilter } from "@/components/ui/datatable-filter/utils";

type FiltersContextType = {
  value: DatatableFilter[];
  onChange: Dispatch<SetStateAction<DatatableFilter[]>>;
};

const FiltersContext = createContext<FiltersContextType>({
  value: [],
  onChange: () => {
    throw new Error("Cannot call onChange outside of FiltersContextProvider");
  },
});

export const useFiltersContextProvider = () => useContext<FiltersContextType>(FiltersContext);

const FiltersContextProvider = ({ children }: PropsWithChildren) => {
  const [filters, setFilters] = useState<DatatableFilter[]>([]);
  const value = useMemo<FiltersContextType>(
    () => ({
      value: filters,
      onChange: setFilters,
    }),
    [filters]
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
};

export default FiltersContextProvider;
