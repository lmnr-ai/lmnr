import { ColumnDef } from "@tanstack/react-table";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import useSWR from "swr";

import { swrFetcher } from "@/lib/utils";

import ClientTimestampFormatter from "../client-timestamp-formatter";
import { DataTable } from "../ui/datatable";

export default function EventNamesBar() {
    const { projectId } = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();

    const { data: eventNames, isLoading } = useSWR<{ name: string; count: number; lastEventTimestamp: string }[]>(
        `/api/projects/${projectId}/event-names`,
        swrFetcher
    );

    const selectedName = searchParams.get("name");

    useEffect(() => {
        if (eventNames && eventNames.length > 0 && !selectedName) {
            router.replace(`/project/${projectId}/events?name=${eventNames[0].name}`);
        }
    }, [eventNames, selectedName, router, projectId]);

    const columns: ColumnDef<{ name: string; count: number; lastEventTimestamp: string }>[] = [
        {
            header: "Name",
            accessorFn: (row) => row.name,
        },
        {
            header: "Last Event",
            accessorFn: (row) => row.lastEventTimestamp,
            cell: ({ row }) => <ClientTimestampFormatter timestamp={row.original.lastEventTimestamp} />,
        },
    ];

    return (
        <div className="flex-none w-80 border-r flex flex-col">
            <div className="font-medium p-2 px-4 text-lg">Event Names</div>
            <DataTable
                columns={columns}
                data={eventNames}
                getRowId={(row) => row.name}
                focusedRowId={selectedName}
                onRowClick={(row) => {
                    router.push(`/project/${projectId}/events?name=${row.original.name}`);
                }}
            />
        </div>
    );
}

