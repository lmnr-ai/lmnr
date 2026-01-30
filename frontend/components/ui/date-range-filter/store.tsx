"use client";

import { subHours } from "date-fns";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useRef } from "react";
import { type DateRange as ReactDateRange } from "react-day-picker";
import { createStore, type StoreApi, useStore } from "zustand";

export type DateRangeMode = "url" | "state";

export interface DateRangeValue {
  pastHours?: string;
  startDate?: string;
  endDate?: string;
}

interface DateRangeFilterStore {
  pastHours: string | null;
  startDate: string | null;
  endDate: string | null;
  calendarDate: ReactDateRange | undefined;
  startTime: string;
  endTime: string;
  mode: DateRangeMode;

  setCalendarDate: (date: ReactDateRange | undefined) => void;
  setStartTime: (time: string) => void;
  setEndTime: (time: string) => void;
  selectQuickRange: (value: string, currentSearchParams?: string) => void;
  applyAbsoluteRange: (currentSearchParams?: string) => void;
  getDisplayRange: () => { from: Date; to: Date };
}

const createDateRangeFilterStore = (
  initialPastHours: string | null,
  initialStartDate: string | null,
  initialEndDate: string | null,
  mode: DateRangeMode,
  onChange: ((value: DateRangeValue) => void) | undefined,
  router: ReturnType<typeof useRouter>,
  pathname: string
) => {
  let calendarDate: ReactDateRange | undefined = undefined;
  let startTime = "00:00";
  let endTime = "00:00";

  if (initialStartDate && initialEndDate) {
    const from = new Date(initialStartDate);
    const to = new Date(initialEndDate);
    calendarDate = { from, to };
    startTime = `${from.getHours().toString().padStart(2, "0")}:${from.getMinutes().toString().padStart(2, "0")}`;
    endTime = `${to.getHours().toString().padStart(2, "0")}:${to.getMinutes().toString().padStart(2, "0")}`;
  }

  return createStore<DateRangeFilterStore>()((set, get) => ({
    pastHours: initialPastHours,
    startDate: initialStartDate,
    endDate: initialEndDate,
    calendarDate,
    startTime,
    endTime,
    mode,

    setCalendarDate: (date) => {
      set({ calendarDate: date });
    },

    setStartTime: (time) => {
      set({ startTime: time });
    },

    setEndTime: (time) => {
      set({ endTime: time });
    },

    getDisplayRange: () => {
      const { startDate, endDate, pastHours } = get();
      if (startDate && endDate) {
        return { from: new Date(startDate), to: new Date(endDate) };
      }
      if (pastHours) {
        const parsedHours = parseInt(pastHours);
        if (!isNaN(parsedHours)) {
          const to = new Date();
          const from = subHours(to, parsedHours);
          return { from, to };
        }
      }
      const to = new Date();
      const from = subHours(to, 24);
      return { from, to };
    },

    selectQuickRange: (rangeValue, currentSearchParams) => {
      set({
        pastHours: rangeValue,
        startDate: null,
        endDate: null,
        calendarDate: undefined,
      });

      if (mode === "url" && currentSearchParams) {
        const newSearchParams = new URLSearchParams(currentSearchParams);
        newSearchParams.delete("startDate");
        newSearchParams.delete("endDate");
        newSearchParams.delete("groupByInterval");
        newSearchParams.set("pastHours", rangeValue);
        newSearchParams.set("pageNumber", "0");
        router.push(`${pathname}?${newSearchParams.toString()}`);
      }

      onChange?.({ pastHours: rangeValue });
    },

    applyAbsoluteRange: (currentSearchParams) => {
      const { calendarDate, startTime, endTime } = get();
      if (!calendarDate?.from || !calendarDate?.to) return;

      const from = new Date(calendarDate.from);
      const [startHour, startMinute] = startTime.split(":").map(Number);
      from.setHours(startHour);
      from.setMinutes(startMinute);

      const to = new Date(calendarDate.to);
      const [endHour, endMinute] = endTime.split(":").map(Number);
      to.setHours(endHour);
      to.setMinutes(endMinute);

      const startDateIso = from.toISOString();
      const endDateIso = to.toISOString();

      set({
        pastHours: null,
        startDate: startDateIso,
        endDate: endDateIso,
      });

      if (mode === "url" && currentSearchParams) {
        const newSearchParams = new URLSearchParams(currentSearchParams);
        newSearchParams.delete("pastHours");
        newSearchParams.set("pageNumber", "0");
        newSearchParams.set("startDate", startDateIso);
        newSearchParams.set("endDate", endDateIso);
        router.push(`${pathname}?${newSearchParams.toString()}`);
      }

      onChange?.({ startDate: startDateIso, endDate: endDateIso });
    },
  }));
};

const DateRangeFilterStoreContext = createContext<StoreApi<DateRangeFilterStore> | undefined>(undefined);

export const useDateRangeFilterContext = <T,>(selector: (store: DateRangeFilterStore) => T): T => {
  const store = useContext(DateRangeFilterStoreContext);
  if (!store) {
    throw new Error("useDateRangeFilterContext must be used within DateRangeFilterProvider");
  }
  return useStore(store, selector);
};

interface DateRangeFilterProviderProps {
  mode?: DateRangeMode;
  initialPastHours?: string;
  initialStartDate?: string;
  initialEndDate?: string;
  onChange?: (value: DateRangeValue) => void;
}

export const DateRangeFilterProvider = ({
  children,
  mode = "url",
  initialPastHours,
  initialStartDate,
  initialEndDate,
  onChange,
}: PropsWithChildren<DateRangeFilterProviderProps>) => {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const { pastHours, startDate, endDate } = useMemo(() => {
    if (mode === "state") {
      return {
        pastHours: initialPastHours ?? null,
        startDate: initialStartDate ?? null,
        endDate: initialEndDate ?? null,
      };
    }

    return {
      pastHours: searchParams.get("pastHours"),
      startDate: searchParams.get("startDate"),
      endDate: searchParams.get("endDate"),
    };
  }, [searchParams, mode, initialPastHours, initialStartDate, initialEndDate]);

  const storeRef = useRef<StoreApi<DateRangeFilterStore>>(null);

  if (!storeRef.current) {
    storeRef.current = createDateRangeFilterStore(pastHours, startDate, endDate, mode, onChange, router, pathname);
  }

  useEffect(() => {
    if (mode === "state") return;

    const store = storeRef.current?.getState();
    if (!store) return;

    const urlPastHours = searchParams.get("pastHours");
    const urlStartDate = searchParams.get("startDate");
    const urlEndDate = searchParams.get("endDate");

    if (store.pastHours !== urlPastHours || store.startDate !== urlStartDate || store.endDate !== urlEndDate) {
      storeRef.current?.setState({
        pastHours: urlPastHours,
        startDate: urlStartDate,
        endDate: urlEndDate,
        calendarDate:
          urlStartDate && urlEndDate ? { from: new Date(urlStartDate), to: new Date(urlEndDate) } : undefined,
      });
    }
  }, [searchParams, mode]);

  return (
    <DateRangeFilterStoreContext.Provider value={storeRef.current}>{children}</DateRangeFilterStoreContext.Provider>
  );
};
