import { isEmpty } from "lodash";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

import { columns } from "@/components/events/columns.tsx";
import { useEventsStoreContext } from "@/components/events/events-store";

import { DataTable } from "../ui/datatable";

export default function EventNamesBar() {
  const { projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedName = searchParams.get("name");

  const { eventNames, fetchEventNames } = useEventsStoreContext((state) => ({
    eventNames: state.eventNames,
    fetchEventNames: state.fetchEventNames,
  }));

  useEffect(() => {
    fetchEventNames();
  }, []);

  useEffect(() => {
    if (eventNames && !isEmpty(eventNames) && !selectedName) {
      router.replace(`/project/${projectId}/events?name=${eventNames[0].name}`);
    }
  }, [eventNames, selectedName, router, projectId]);

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
