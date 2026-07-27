"use client";

import { useCallback, useRef, useState } from "react";

import { TracePickerChrome } from "@/components/traces/trace-picker/chrome";
import { TracePickerGrid } from "@/components/traces/trace-picker/grid";
import { type Filter } from "@/lib/actions/common/filters";
import { type TraceRow } from "@/lib/traces/types";

export interface TracePickerProps {
  onTraceSelect: (trace: TraceRow) => void;
  focusedTraceId?: string | null;
  excludeTraceId?: string;
  description?: string;
  fetchParams?: Record<string, string>;
  className?: string;
}

const TracePickerContent = ({
  onTraceSelect,
  focusedTraceId,
  excludeTraceId,
  description,
  fetchParams,
  className,
}: TracePickerProps) => {
  const [searchValue, setSearchValue] = useState<{ filters: Filter[]; search: string }>({
    filters: [],
    search: "",
  });
  const [dateRange, setDateRange] = useState<{
    pastHours?: string;
    startDate?: string;
    endDate?: string;
  }>({ pastHours: "24" });

  const refetchRef = useRef<() => void>(() => {});

  const handleRefresh = useCallback(() => {
    refetchRef.current();
  }, []);

  const chrome = (
    <TracePickerChrome
      dateRange={dateRange}
      onDateRangeChange={setDateRange}
      onRefresh={handleRefresh}
      searchValue={searchValue}
      onSearchChange={setSearchValue}
    />
  );

  return (
    <div className={className ?? "flex flex-col flex-1 gap-3 px-4 py-2 overflow-hidden"}>
      {description && <span className="text-secondary-foreground text-xs px-1">{description}</span>}
      <TracePickerGrid
        chrome={chrome}
        filters={searchValue.filters}
        search={searchValue.search.length > 0 ? searchValue.search : null}
        dateRange={dateRange}
        refetchRef={refetchRef}
        onTraceSelect={onTraceSelect}
        focusedTraceId={focusedTraceId}
        excludeTraceId={excludeTraceId}
        fetchParams={fetchParams}
      />
    </div>
  );
};

export default TracePickerContent;
