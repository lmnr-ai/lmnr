"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useEffect, useMemo } from "react";

import SearchInput from "@/components/common/search-input";
import { eventsTableColumns, eventsTableFilters } from "@/components/events/columns.tsx";
import { useEventsStoreContext } from "@/components/events/events-store";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import { EventRow } from "@/lib/events/types";

import { DataTable } from "../ui/datatable";
import Header from "../ui/header";
import EventNamesBar from "./events-names-bar";

export default function Events() {
  const pathName = usePathname();
  const { push } = useRouter();
  const searchParams = useSearchParams();

  const { events, totalCount, fetchEvents } = useEventsStoreContext((state) => ({
    events: state.events,
    totalCount: state.totalCount,
    fetchEvents: state.fetchEvents,
  }));

  const eventsParams = useMemo(() => {
    const sp = new URLSearchParams();

    const eventName = searchParams.get("name");
    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");
    const filter = searchParams.getAll("filter");
    const pageNumber = searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0;
    const pageSize = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50;

    if (eventName) {
      sp.set("name", eventName);
    }

    if (pastHours) {
      sp.set("pastHours", pastHours);
    }

    if (startDate) {
      sp.set("startDate", startDate);
    }

    if (endDate) {
      sp.set("endDate", endDate);
    }

    if (search && search.trim() !== "") {
      sp.set("search", search);
    }

    filter.forEach((f) => sp.append("filter", f));

    sp.append("pageNumber", String(pageNumber));
    sp.append("pageSize", String(pageSize));

    return sp;
  }, [searchParams]);

  const page = useMemo<{ number: number; size: number }>(() => {
    const size = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50;
    return {
      number: searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0,
      size,
    };
  }, [searchParams]);

  useEffect(() => {
    fetchEvents(eventsParams);
  }, [eventsParams]);

  const handlePageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      push(`${pathName}?${params}`);
    },
    [pathName, push, searchParams]
  );

  return (
    <div className="flex flex-col flex-1">
      <Header path="events" />
      <div className="flex flex-1 overflow-hidden">
        <EventNamesBar />
        <div className="flex flex-col flex-1 overflow-auto">
          <div className="flex gap-4 py-2 px-4 items-center">
            <div className="text-primary-foreground text-lg font-medium">
              {searchParams.get("name") || "All Events"}
            </div>
          </div>
          <DataTable
            columns={eventsTableColumns}
            data={events}
            defaultPageNumber={page.number}
            defaultPageSize={page.size}
            pageCount={Math.ceil(Number(totalCount || 0) / page.size)}
            totalItemsCount={Number(totalCount || 0)}
            onPageChange={handlePageChange}
            getRowId={(row: EventRow) => row.id}
            paginated
            manualPagination
            pageSizeOptions={[25, 50, 100]}
            childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
          >
            <div className="flex flex-1 w-full space-x-2">
              <DataTableFilter columns={eventsTableFilters} />
              <SearchInput placeholder="Search events..." />
            </div>
            <DataTableFilterList />
          </DataTable>
        </div>
      </div>
    </div>
  );
}
