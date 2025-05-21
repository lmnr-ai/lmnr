"use client";

import { Row } from "@tanstack/react-table";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import RefreshButton from "@/components/traces/refresh-button";
import { columns, filters } from "@/components/traces/sessions-table/columns";
import { useToast } from "@/lib/hooks/use-toast";
import { SessionPreview, Trace } from "@/lib/traces/types";
import { PaginatedResponse } from "@/lib/types";

import { DataTable } from "../../ui/datatable";
import DataTableFilter, { DataTableFilterList } from "../../ui/datatable-filter";
import DateRangeFilter from "../../ui/date-range-filter";
import TextSearchFilter from "../../ui/text-search-filter";

type SessionRow = {
  type: string;
  data: SessionPreview | Trace;
  subRows: SessionRow[];
};

interface SessionsTableProps {
  onRowClick?: (rowId: string) => void;
}

export default function SessionsTable({ onRowClick }: SessionsTableProps) {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();

  const [focusedRowId, setFocusedRowId] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<SessionRow[] | undefined>(undefined);

  const defaultPageNumber = searchParams.get("pageNumber") ?? "0";
  const defaultPageSize = searchParams.get("pageSize") ?? "50";
  const [totalCount, setTotalCount] = useState<number>(0);
  const pageNumber = parseInt(searchParams.get("pageNumber") ?? "0");
  const pageSize = Math.max(parseInt(defaultPageSize), 1);
  const pageCount = Math.ceil(totalCount / pageSize);
  const filter = searchParams.get("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  const getSessions = useCallback(async () => {
    try {
      setSessions(undefined);
      let queryFilter = searchParams.getAll("filter");

      if (!pastHours && !startDate && !endDate) {
        const sp = new URLSearchParams();
        for (const [key, value] of Object.entries(searchParams)) {
          if (key !== "pastHours") {
            sp.set(key, value as string);
          }
        }
        sp.set("pastHours", "24");
        router.push(`${pathName}?${sp.toString()}`);
        return;
      }

      const urlParams = new URLSearchParams();
      urlParams.set("pageNumber", pageNumber.toString());
      urlParams.set("pageSize", pageSize.toString());

      queryFilter.forEach((filter) => urlParams.append("filter", filter));

      if (pastHours != null) urlParams.set("pastHours", pastHours);
      if (startDate != null) urlParams.set("startDate", startDate);
      if (endDate != null) urlParams.set("endDate", endDate);

      if (typeof textSearchFilter === "string" && textSearchFilter.length > 0) {
        urlParams.set("search", textSearchFilter);
      }

      const url = `/api/projects/${projectId}/sessions?${urlParams.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!res.ok) {
        throw new Error(`Failed to fetch sessions: ${res.status} ${res.statusText}`);
      }

      const data = (await res.json()) as PaginatedResponse<SessionPreview>;

      setSessions(
        data.items.map((s) => ({
          type: "session",
          data: s,
          subRows: [],
        }))
      );

      setTotalCount(data.totalCount);
    } catch (error) {
      toast({
        title: "Failed to load sessions. Please try again.",
        variant: "destructive",
      });
      // Set empty sessions to show error state
      setSessions([]);
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

  const onPageChange = useCallback(
    (pageNumber: number, pageSize: number) => {
      const params = new URLSearchParams(searchParams);
      params.set("pageNumber", pageNumber.toString());
      params.set("pageSize", pageSize.toString());
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );

  const handleRowClick = useCallback(
    async (row: Row<SessionRow>) => {
      if (row.original.type === "trace") {
        const params = new URLSearchParams(searchParams);
        setFocusedRowId(row.original.data.id);
        onRowClick?.(row.original.data.id);
        params.set("selectedId", row.original.data.id);
        router.push(`${pathName}?${params.toString()}`);
        return;
      }

      row.toggleExpanded();

      const filter = {
        column: "session_id",
        value: row.original.data.id,
        operator: "eq",
      };

      const res = await fetch(
        `/api/projects/${projectId}/traces?pageNumber=0&pageSize=50&filter=${JSON.stringify(filter)}`
      );

      const traces = (await res.json()) as PaginatedResponse<Trace>;
      setSessions((sessions) =>
        sessions?.map((s) => {
          if (s.data.id === row.original.data.id) {
            return {
              ...s,
              type: "session",
              subRows: traces.items
                .map((t) => ({
                  type: "trace",
                  data: t,
                  subRows: [],
                }))
                .toReversed(),
            };
          } else {
            return s;
          }
        })
      );
    },
    [onRowClick, pathName, projectId, router, searchParams]
  );

  useEffect(() => {
    getSessions();
  }, [pageSize, defaultPageNumber, projectId, filter, pastHours, startDate, endDate, textSearchFilter]);

  return (
    <DataTable
      className="border-none w-full"
      columns={columns}
      data={sessions}
      getRowId={(row) => row.data.id}
      onRowClick={handleRowClick}
      paginated
      focusedRowId={focusedRowId}
      pageCount={pageCount}
      defaultPageSize={pageSize}
      defaultPageNumber={parseInt(defaultPageNumber)}
      onPageChange={onPageChange}
      manualPagination
      totalItemsCount={totalCount}
      enableRowSelection
      childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
    >
      <div className="flex flex-1 w-full space-x-2">
        <TextSearchFilter />
        <DataTableFilter columns={filters} />
        <DateRangeFilter />
        <RefreshButton iconClassName="w-3.5 h-3.5" onClick={getSessions} variant="outline" className="text-xs" />
      </div>
      <DataTableFilterList />
    </DataTable>
  );
}
