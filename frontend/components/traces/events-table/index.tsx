"use client";

import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import SearchInput from "@/components/common/search-input";
import { columns, filters } from "@/components/traces/events-table/columns";
import RefreshButton from "@/components/traces/refresh-button";
import { EventsTableRow } from "@/lib/actions/events";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";

import { DataTable } from "../../ui/datatable";
import DataTableFilter, { DataTableFilterList } from "../../ui/datatable-filter";
import DateRangeFilter from "../../ui/date-range-filter";

export default function EventsTable() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const pageNumber = searchParams.get("pageNumber") ? parseInt(searchParams.get("pageNumber")!) : 0;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  const [events, setEvents] = useState<EventsTableRow[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageCount = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);

  const getEvents = useCallback(async () => {
    try {
      setEvents(undefined);

      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());

      if (pastHours != null) urlParams.set("pastHours", pastHours);
      if (startDate != null) urlParams.set("startDate", startDate);
      if (endDate != null) urlParams.set("endDate", endDate);

      filter.forEach((filter) => urlParams.append("filter", filter));

      if (typeof textSearchFilter === "string" && textSearchFilter.length > 0) {
        urlParams.set("search", textSearchFilter);
      }

      const url = `/api/projects/${projectId}/events?${urlParams.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch events: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as PaginatedResponse<EventsTableRow>;

      setEvents(data.items);
      setTotalCount(data.totalCount);
    } catch (error) {
      toast({
        title: "Failed to load events. Please try again.",
        variant: "destructive",
      });
      setEvents([]);
      setTotalCount(0);
    }
  }, [
    endDate,
    pageNumber,
    pageSize,
    pastHours,
    pathName,
    projectId,
    router,
    searchParams,
    startDate,
    textSearchFilter,
    filter,
    toast,
  ]);

  useEffect(() => {
    if (pastHours || startDate || endDate) {
      getEvents();
    } else {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.push(`${pathName}?${sp.toString()}`);
    }
  }, [projectId, pageNumber, pageSize, JSON.stringify(filter), pastHours, startDate, endDate, textSearchFilter]);

  const onPageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  return (
    <DataTable
      className="border-none w-full"
      columns={columns}
      data={events}
      getRowId={(event) => event.id}
      paginated
      manualPagination
      pageCount={pageCount}
      defaultPageSize={pageSize}
      defaultPageNumber={pageNumber}
      onPageChange={onPageChange}
      totalItemsCount={totalCount}
      enableRowSelection
      childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
    >
      <div className="flex flex-1 w-full space-x-2">
        <DataTableFilter columns={filters} />
        <DateRangeFilter />
        <RefreshButton iconClassName="w-3.5 h-3.5" onClick={getEvents} variant="outline" className="text-xs" />
        <SearchInput placeholder="Search in events..." />
      </div>
      <DataTableFilterList />
    </DataTable>
  );
}
