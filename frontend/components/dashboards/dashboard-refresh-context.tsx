"use client";

import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from "react";

interface DashboardRefreshContextValue {
  // Bumped on every manual refresh; charts refetch their data when it changes.
  refreshKey: number;
  refresh: () => void;
}

const DashboardRefreshContext = createContext<DashboardRefreshContextValue>({
  refreshKey: 0,
  refresh: () => {},
});

export const DashboardRefreshProvider = ({ children }: PropsWithChildren) => {
  const [refreshKey, setRefreshKey] = useState(0);
  const refresh = useCallback(() => setRefreshKey((prev) => prev + 1), []);
  const value = useMemo(() => ({ refreshKey, refresh }), [refreshKey, refresh]);

  return <DashboardRefreshContext.Provider value={value}>{children}</DashboardRefreshContext.Provider>;
};

export const useDashboardRefresh = () => useContext(DashboardRefreshContext);
