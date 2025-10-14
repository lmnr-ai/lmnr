"use client";

import { Row } from "@tanstack/react-table";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useEffect, useState } from "react";

import { columns } from "@/components/event-definitions/columns.tsx";
import {
  EventDefinition,
  useEventDefinitionsStoreContext,
} from "@/components/event-definitions/event-definitions-store";
import ManageEventDefinitionDialog from "@/components/event-definitions/manage-event-definition-dialog";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table.tsx";

import { DataTable } from "../ui/datatable";
import Header from "../ui/header";

export default function EventDefinitions() {
  const router = useRouter();
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { eventDefinitions, fetchEventDefinitions, targetEventDefinition, setTargetEventDefinition } =
    useEventDefinitionsStoreContext((state) => ({
      eventDefinitions: state.eventDefinitions,
      fetchEventDefinitions: state.fetchEventDefinitions,
      targetEventDefinition: state.targetEventDefinition,
      setTargetEventDefinition: state.setTargetEventDefinition,
    }));

  useEffect(() => {
    fetchEventDefinitions();
  }, []);

  const handleRowClick = useCallback(
    (row: Row<EventDefinition>) => {
      router.push(`/project/${projectId}/events/${row.original.id}`);
    },
    [projectId, router]
  );

  const handleCreateNew = useCallback(() => {
    setTargetEventDefinition(undefined);
    setIsDialogOpen(true);
  }, [setTargetEventDefinition]);

  const handleSuccess = useCallback(async () => {
    await fetchEventDefinitions();
  }, [fetchEventDefinitions]);

  return (
    <div className="flex flex-col flex-1">
      <Header path="events" />
      <div className="flex flex-col flex-1 overflow-auto">
        <div className="flex gap-4 p-4 items-center justify-between">
          <div className="text-primary-foreground text-2xl font-medium">Event Definitions</div>
          <ManageEventDefinitionDialog
            open={isDialogOpen}
            setOpen={setIsDialogOpen}
            defaultValues={targetEventDefinition}
            onSuccess={handleSuccess}
            key={targetEventDefinition?.id || "new"}
          >
            <Button variant="outline" onClick={handleCreateNew}>
              New Event Definition
            </Button>
          </ManageEventDefinitionDialog>
        </div>
        <DataTable
          emptyRow={
            <TableRow>
              <TableCell colSpan={columns.length} className="text-center">
                No event definitions found. Create your first event definition to get started.
              </TableCell>
            </TableRow>
          }
          columns={columns}
          data={eventDefinitions}
          getRowId={(row) => row.id}
          onRowClick={handleRowClick}
        />
      </div>
    </div>
  );
}
