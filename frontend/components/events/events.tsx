"use client";

import { ColumnDef } from "@tanstack/react-table";
import { flow } from "lodash";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import React, { useCallback, useMemo } from "react";
import useSWR from "swr";

import SearchInput from "@/components/common/search-input";
import DataTableFilter, { DataTableFilterList } from "@/components/ui/datatable-filter";
import { ColumnFilter } from "@/components/ui/datatable-filter/utils";
import { EventRow } from "@/lib/events/types";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { DataTable } from "../ui/datatable";
import DateRangeFilter from "../ui/date-range-filter";
import Header from "../ui/header";
import Mono from "../ui/mono";
import EventNamesBar from "./events-names-bar";

const columns: ColumnDef<EventRow>[] = [
    {
        accessorKey: "id",
        cell: (row) => <Mono>{String(row.getValue())}</Mono>,
        header: "ID",
        size: 300,
    },
    {
        accessorKey: "name",
        header: "Name",
        size: 200,
    },
    {
        accessorKey: "timestamp",
        header: "Timestamp",
        cell: (row) => <ClientTimestampFormatter timestamp={String(row.getValue())} />,
        size: 200,
    },
    {
        accessorKey: "traceId",
        header: "Trace ID",
        cell: (row) => <Mono>{String(row.getValue())}</Mono>,
        size: 300,
    },
    {
        accessorKey: "spanId",
        header: "Span ID",
        cell: (row) => <Mono>{String(row.getValue())}</Mono>,
        size: 300,
    },
    {
        accessorKey: "userId",
        header: "User ID",
        size: 200,
    },
    {
        accessorKey: "sessionId",
        header: "Session ID",
        size: 200,
    },
    {
        accessorKey: "attributes",
        header: "Attributes",
        accessorFn: flow(
            (row: EventRow) => row.attributes,
            (attributes) => (attributes && attributes !== "{}" ? attributes : "-")
        ),
        size: 300,
    },
];

const filters: ColumnFilter[] = [
    {
        name: "ID",
        key: "id",
        dataType: "string",
    },
    {
        name: "Name",
        key: "name",
        dataType: "string",
    },
    {
        name: "User ID",
        key: "user_id",
        dataType: "string",
    },
    {
        name: "Session ID",
        key: "session_id",
        dataType: "string",
    },
];

export default function Events() {
    const params = useParams();
    const pathName = usePathname();
    const { push } = useRouter();
    const searchParams = useSearchParams();
    const eventName = searchParams.get("name");
    const filter = searchParams.getAll("filter");
    const pastHours = searchParams.get("pastHours");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const search = searchParams.get("search");

    const page = useMemo<{ number: number; size: number }>(() => {
        const size = searchParams.get("pageSize") ? Number(searchParams.get("pageSize")) : 50;
        return {
            number: searchParams.get("pageNumber") ? Number(searchParams.get("pageNumber")) : 0,
            size,
        };
    }, [searchParams]);

    const eventsParams = useMemo(() => {
        const sp = new URLSearchParams();
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

        sp.append("pageNumber", String(page.number));
        sp.append("pageSize", String(page.size));

        return sp;
    }, [filter, eventName, page.number, page.size, pastHours, startDate, endDate, search]);

    const { data } = useSWR<PaginatedResponse<EventRow>>(
        `/api/projects/${params?.projectId}/events?${eventsParams.toString()}`,
        swrFetcher
    );

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
                    <div className="flex gap-4 pt-4 px-4 items-center">
                        <div className="text-primary-foreground text-xl font-medium">{eventName || "All Events"}</div>
                    </div>
                    <div className="flex-1 px-2 overflow-auto">
                        <DataTable
                            columns={columns}
                            data={data?.items}
                            defaultPageNumber={page.number}
                            defaultPageSize={page.size}
                            pageCount={Math.ceil(Number(data?.totalCount || 0) / page.size)}
                            totalItemsCount={Number(data?.totalCount || 0)}
                            onPageChange={handlePageChange}
                            getRowId={(row: EventRow) => row.id}
                            paginated
                            manualPagination
                            pageSizeOptions={[25, 50, 100]}
                            childrenClassName="flex flex-col gap-2 py-2 items-start h-fit space-x-0"
                        >
                            <div className="flex flex-1 w-full space-x-2">
                                <DataTableFilter columns={filters} />
                                <DateRangeFilter />
                                <SearchInput placeholder="Search events..." />
                            </div>
                            <DataTableFilterList />
                        </DataTable>
                    </div>
                </div>
            </div>
        </div>
    );
}

