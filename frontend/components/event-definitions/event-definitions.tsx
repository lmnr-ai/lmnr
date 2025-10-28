"use client";

import { Row } from "@tanstack/react-table";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";

import { columns } from "@/components/event-definitions/columns.tsx";
import ManageEventDefinitionDialog from "@/components/event-definitions/manage-event-definition-dialog";
import { Button } from "@/components/ui/button";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/datatable-store";
import { useInfiniteScroll } from "@/components/ui/infinite-datatable/hooks";
import { useProjectContext } from "@/contexts/project-context";
import { EventDefinitionRow } from "@/lib/actions/event-definitions";
import { useToast } from "@/lib/hooks/use-toast";

import Header from "../ui/header";

export default function EventDefinitions() {
  return (
    <DataTableStateProvider uniqueKey="id">
      <EventDefinitionsContent />
    </DataTableStateProvider>
  );
}

function EventDefinitionsContent() {
  const router = useRouter();
  const { projectId } = useParams();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { workspace } = useProjectContext();
  const { toast } = useToast();

  const isFreeTier = workspace?.tierName.toLowerCase().trim() === "free";

  const fetchEventDefinitions = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${projectId}/event-definitions`);
      if (!response.ok) throw new Error("Failed to fetch event definitions");

      const data = (await response.json()) as EventDefinitionRow[];
      // Since API doesn't paginate, return all data on first page
      return { items: data, count: data.length };
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : "Failed to load event definitions.",
        variant: "destructive",
      });
      throw error;
    }
  }, [projectId, toast]);

  const {
    data: eventDefinitions,
    hasMore,
    isFetching,
    isLoading,
    fetchNextPage,
    refetch,
  } = useInfiniteScroll<EventDefinitionRow>({
    fetchFn: fetchEventDefinitions,
    enabled: true,
    deps: [projectId],
  });

  const handleRowClick = useCallback(
    (row: Row<EventDefinitionRow>) => {
      router.push(`/project/${projectId}/events/${row.original.id}`);
    },
    [projectId, router]
  );

  const handleSuccess = useCallback(async () => {
    await refetch();
  }, [refetch]);

  return (
    <>
      <Header path="event definitions" />
      <div className="flex flex-col gap-4 overflow-hidden px-4 pb-4">
        {!isFreeTier && (
          <ManageEventDefinitionDialog open={isDialogOpen} setOpen={setIsDialogOpen} onSuccess={handleSuccess}>
            <Button icon="plus" className="w-fit" onClick={() => setIsDialogOpen(true)}>
              Event Definition
            </Button>
          </ManageEventDefinitionDialog>
        )}
        <InfiniteDataTable<EventDefinitionRow>
          columns={columns}
          data={eventDefinitions}
          getRowId={(row) => row.id}
          onRowClick={handleRowClick}
          hasMore={hasMore}
          isFetching={isFetching}
          isLoading={isLoading}
          fetchNextPage={fetchNextPage}
          estimatedRowHeight={41}
        />
      </div>
    </>
  );
}
