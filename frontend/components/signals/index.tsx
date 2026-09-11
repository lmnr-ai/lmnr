"use client";

import { useParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { signalsColumnLabels } from "@/components/signals/columns";
import {
  DEFAULT_SPARKLINE_PAST_HOURS,
  defaultSignalsColumnOrder,
  defaultSignalsColumnVisibility,
  RESOURCE,
} from "@/components/signals/constants";
import SignalsBanner, { SignalsBannerInfoButton } from "@/components/signals/signals-banner";
import { SignalsTableContents } from "@/components/signals/table-contents";
import { SignalsTableControls } from "@/components/signals/table-controls";
import { type DateRangeValue } from "@/components/ui/date-range-filter/store";
import Header from "@/components/ui/header.tsx";
import { useTableView } from "@/components/ui/infinite-datatable/model/table-config-store";
import { InfiniteDataTableProvider } from "@/components/ui/infinite-datatable/model/table-store";
import { track } from "@/lib/posthog";

export default function Signals() {
  const { projectId } = useParams();
  return (
    <InfiniteDataTableProvider
      uniqueKey="id"
      defaults={{ columnOrder: defaultSignalsColumnOrder, columnVisibility: defaultSignalsColumnVisibility }}
      lockedColumns={["__row_selection"]}
      views={{ projectId: String(projectId), resource: RESOURCE }}
    >
      <SignalsContent />
    </InfiniteDataTableProvider>
  );
}

function SignalsContent() {
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRangeValue>({ pastHours: DEFAULT_SPARKLINE_PAST_HOURS });
  const refetchRef = useRef<() => void>(() => {});

  useEffect(() => {
    track("signals", "page_viewed");
  }, []);

  const { effective, isLoading: isViewLoading, setSort, setSearchAndFilters, setFilters } = useTableView();

  const filter = useMemo(() => effective.filters.map((f) => JSON.stringify(f)), [effective.filters]);
  const search = effective.search.length > 0 ? effective.search : null;
  const sortBy = effective.sortBy ?? undefined;
  const sortDirection = (effective.sortDirection ?? undefined) as "asc" | "desc" | undefined;
  const searchValue = useMemo(
    () => ({ filters: effective.filters, search: effective.search }),
    [effective.filters, effective.search]
  );

  const sparklinePastHours = dateRange.pastHours ?? DEFAULT_SPARKLINE_PAST_HOURS;

  const handleSuccess = useCallback(async () => {
    refetchRef.current();
  }, []);

  const handleSort = useCallback(
    (columnId: string, direction: "asc" | "desc") => {
      setSort(columnId || null, columnId ? direction : null);
    },
    [setSort]
  );

  return (
    <>
      <Header path="signals">
        <SignalsBannerInfoButton />
      </Header>
      <div className="px-4">
        <SignalsBanner onCreateSignal={() => setIsDialogOpen(true)} />
      </div>
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 overflow-hidden">
        <div className="flex flex-1 overflow-hidden">
          <SignalsTableContents
            refetchRef={refetchRef}
            filter={filter}
            search={search}
            sortBy={sortBy}
            sortDirection={sortDirection}
            onSort={handleSort}
            isViewLoading={isViewLoading}
            sparklinePastHours={sparklinePastHours}
          >
            <SignalsTableControls
              projectId={String(projectId)}
              filters={effective.filters}
              onFiltersChange={setFilters}
              searchValue={searchValue}
              onSearchChange={setSearchAndFilters}
              columnLabels={signalsColumnLabels}
              dateRange={dateRange}
              onDateRangeChange={setDateRange}
              isCreateOpen={isDialogOpen}
              onCreateOpenChange={setIsDialogOpen}
              onCreateSuccess={handleSuccess}
            />
          </SignalsTableContents>
        </div>
      </div>
    </>
  );
}
