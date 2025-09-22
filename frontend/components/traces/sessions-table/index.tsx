"use client";

import { map } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import SearchInput from "@/components/common/search-input";
import RefreshButton from "@/components/traces/refresh-button";
import { columns, filters } from "@/components/traces/sessions-table/columns";
import { useTraceViewNavigation } from "@/components/traces/trace-view/navigation-context";
import { useTracesStoreContext } from "@/components/traces/traces-store";
import DeleteSelectedRows from "@/components/ui/DeleteSelectedRows";
import { useToast } from "@/lib/hooks/use-toast";
import { SessionRow } from "@/lib/traces/types";
import { PaginatedResponse } from "@/lib/types";

import { DataTable } from "../../ui/datatable";
import DataTableFilter, { DataTableFilterList } from "../../ui/datatable-filter";
import DateRangeFilter from "../../ui/date-range-filter";

export default function SessionsTable() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const { setTraceId, traceId } = useTracesStoreContext((state) => ({
    setTraceId: state.setTraceId,
    traceId: state.traceId,
  }));

  const pageNumber = searchParams.get("pageNumber") ? parseInt(searchParams.get("pageNumber")!) : 0;
  const pageSize = searchParams.get("pageSize") ? parseInt(searchParams.get("pageSize")!) : 50;
  const filter = searchParams.getAll("filter");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const pastHours = searchParams.get("pastHours");
  const textSearchFilter = searchParams.get("search");

  const [sessions, setSessions] = useState<SessionRow[] | undefined>(undefined);
  const [totalCount, setTotalCount] = useState<number>(0); // including the filtering
  const pageCount = useMemo(() => Math.ceil(totalCount / pageSize), [totalCount, pageSize]);

  const { setNavigationRefList } = useTraceViewNavigation();

  useEffect(() => {
    setNavigationRefList(map(sessions, (s) => s.id));
  }, [setNavigationRefList, sessions]);

  const getSessions = useCallback(async () => {
    try {
      setSessions(undefined);

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

      const data = (await res.json()) as PaginatedResponse<SessionRow>;

      setSessions(data.items);
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

  useEffect(() => {
    if (pastHours || startDate || endDate) {
      getSessions();
    } else {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set("pastHours", "24");
      router.push(`${pathName}?${sp.toString()}`);
    }
  }, [projectId, pageNumber, pageSize, JSON.stringify(filter), pastHours, startDate, endDate, textSearchFilter]);

  const handleDeleteSessions = useCallback(
    async (sessionIds: string[]) => {
      const params = new URLSearchParams(sessionIds.map((id) => ["id", id]));

      try {
        const response = await fetch(`/api/projects/${projectId}/sessions?${params.toString()}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          toast({
            title: "Failed to delete Session",
            variant: "destructive",
          });
        } else {
          toast({
            title: "Sessions deleted",
            description: `Successfully deleted ${sessionIds.length} session(s).`,
          });
          setSessions((prev) => {
            if (prev) {
              return prev.filter((s) => !sessionIds.includes(s.id));
            }
            return prev;
          });
          setTotalCount((prev) => Math.max(prev - sessionIds.length, 0));
        }
      } catch (e) {
        toast({
          title: e instanceof Error ? e.message : "Failed to delete sessions. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, toast]
  );

  const handleRowClick = useCallback(
    (row: SessionRow) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("sessionId", row.id);
      // Navigate to traces with session filter
      const filterParam = JSON.stringify({ column: "session_id", value: row.id, operator: "eq" });
      params.set("filter", filterParam);
      router.push(`/project/${projectId}/traces?${params.toString()}`);
    },
    [pathName, router, searchParams, projectId]
  );

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
      data={sessions}
      getRowId={(session) => session.id}
      onRowClick={(row) => {
        handleRowClick(row.original);
      }}
      paginated
      focusedRowId={searchParams.get("sessionId")}
      manualPagination
      pageCount={pageCount}
      defaultPageSize={pageSize}
      defaultPageNumber={pageNumber}
      onPageChange={onPageChange}
      totalItemsCount={totalCount}
      enableRowSelection
      childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
      selectionPanel={(selectedRowIds) => (
        <div className="flex flex-col space-y-2">
          <DeleteSelectedRows selectedRowIds={selectedRowIds} onDelete={handleDeleteSessions} entityName="sessions" />
        </div>
      )}
    >
      <div className="flex flex-1 w-full space-x-2">
        <DataTableFilter columns={filters} />
        <DateRangeFilter />
        <RefreshButton iconClassName="w-3.5 h-3.5" onClick={getSessions} variant="outline" className="text-xs" />
        <SearchInput placeholder="Search in sessions..." />
      </div>
      <DataTableFilterList />
    </DataTable>
  );
}
