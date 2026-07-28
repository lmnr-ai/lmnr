"use client";

import { useCallback, useRef, useState } from "react";

import { TracePickerContents } from "@/components/traces/trace-picker/table-contents";
import { TracePickerControls } from "@/components/traces/trace-picker/table-controls";
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

  return (
    <div className={className ?? "flex flex-col flex-1 gap-3 px-4 py-2 overflow-hidden"}>
      {description && <span className="text-secondary-foreground text-xs px-1">{description}</span>}
      <TracePickerContents
        filters={searchValue.filters}
        search={searchValue.search.length > 0 ? searchValue.search : null}
        dateRange={dateRange}
        refetchRef={refetchRef}
        onTraceSelect={onTraceSelect}
        focusedTraceId={focusedTraceId}
        excludeTraceId={excludeTraceId}
        fetchParams={fetchParams}
      >
        <TracePickerControls
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          onRefresh={handleRefresh}
          searchValue={searchValue}
          onSearchChange={setSearchValue}
        />
      </TracePickerContents>
    </div>
  );
};

export default TracePickerContent;
