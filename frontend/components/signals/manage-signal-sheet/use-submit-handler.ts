import { useCallback } from "react";

import { schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { type useToast } from "@/lib/hooks/use-toast";

import { getDefaultValues, type ManageSignalForm, type TriggerFormItem } from "./types";

/**
 * Sync triggers for a signal by creating new, updating existing, and deleting removed triggers.
 * Returns the final list of triggers with server-assigned IDs.
 */
async function syncTriggers(
  projectId: string,
  signalId: string,
  triggers: TriggerFormItem[],
  previousTriggerIds: string[]
): Promise<TriggerFormItem[]> {
  const currentIds = triggers.filter((t) => t.id).map((t) => t.id!);
  const toDelete = previousTriggerIds.filter((id) => !currentIds.includes(id));
  const toCreate = triggers.filter((t) => !t.id && t.filters.length > 0);
  const toUpdate = triggers.filter((t) => t.id && t.filters.length > 0);

  const baseUrl = `/api/projects/${projectId}/signals/${signalId}/triggers`;

  const deleteOp =
    toDelete.length > 0
      ? fetch(baseUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerIds: toDelete }),
        })
      : null;

  const createOps = toCreate.map((trigger) =>
    fetch(baseUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters: trigger.filters }),
    })
  );

  const updateOps = toUpdate.map((trigger) =>
    fetch(baseUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ triggerId: trigger.id, filters: trigger.filters }),
    })
  );

  const [deleteRes, createResponses, updateResponses] = await Promise.all([
    deleteOp,
    Promise.all(createOps),
    Promise.all(updateOps),
  ]);

  const allResponses = [...(deleteRes ? [deleteRes] : []), ...createResponses, ...updateResponses];
  const failed = allResponses.filter((r) => !r.ok);
  if (failed.length > 0) {
    throw new Error("Failed to sync one or more triggers");
  }

  // Parse created trigger responses to get server-assigned IDs
  const createdTriggers: TriggerFormItem[] = await Promise.all(
    createResponses.map(async (r) => {
      const body = (await r.json()) as { id: string; filters: TriggerFormItem["filters"] };
      return { id: body.id, filters: body.filters };
    })
  );

  // Rebuild the list in original order, replacing new triggers with their server-assigned versions
  let createIndex = 0;
  return triggers
    .filter((t) => t.filters.length > 0)
    .map((t) => {
      if (!t.id) {
        return createdTriggers[createIndex++];
      }
      return t;
    });
}

export default function useSubmitHandler({
  projectId,
  toast,
  setOpen,
  reset,
  onSuccess,
  setIsLoading,
  previousTriggerIds,
}: {
  projectId: string;
  toast: ReturnType<typeof useToast>["toast"];
  setOpen: (open: boolean) => void;
  reset: (values: ManageSignalForm) => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  setIsLoading: (loading: boolean) => void;
  previousTriggerIds: string[];
}) {
  return useCallback(
    async (data: ManageSignalForm) => {
      try {
        setIsLoading(true);
        const structuredOutput = schemaFieldsToJsonSchema(data.schemaFields);
        const signal = { name: data.name, prompt: data.prompt, structuredOutput };
        const isUpdate = !!data.id;
        const url = isUpdate ? `/api/projects/${projectId}/signals/${data.id}` : `/api/projects/${projectId}/signals`;
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(signal),
        });

        if (!res.ok) {
          let errorMessage = `Failed to ${isUpdate ? "update" : "create"} the signal`;
          try {
            const error = (await res.json()) as { error?: string };
            if (error?.error) errorMessage = error.error;
          } catch {
            // Response was not JSON
          }
          toast({
            variant: "destructive",
            title: "Error",
            description: errorMessage,
          });
          return;
        }

        // Get the signal ID (from response for new signals, from form for updates)
        const signalId = isUpdate ? data.id! : ((await res.clone().json()) as { id: string }).id;

        // Sync triggers and get back the list with server-assigned IDs
        const triggersToSync = data.triggers.filter((t) => t.filters.length > 0);
        let syncedTriggers = triggersToSync;
        if (triggersToSync.length > 0 || previousTriggerIds.length > 0) {
          syncedTriggers = await syncTriggers(projectId, signalId, triggersToSync, isUpdate ? previousTriggerIds : []);
        }

        if (onSuccess) await onSuccess({ ...data, id: signalId, triggers: syncedTriggers });
        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} signal` });
        setOpen(false);
        reset(getDefaultValues(projectId));
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description:
            e instanceof Error ? e.message : `Failed to ${data.id ? "update" : "create"} the signal. Please try again.`,
        });
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, toast, setOpen, reset, onSuccess, setIsLoading, previousTriggerIds]
  );
}
