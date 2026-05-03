import { useCallback } from "react";

import { schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { type useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import { type ManageSignalForm, type TriggerFormItem } from "./types";

/**
 * Sync triggers for a signal by creating new, updating existing, and deleting removed triggers.
 * Returns the final list of triggers with server-assigned IDs.
 *
 * On partial failure, successfully created triggers are still returned with their IDs
 * so the caller can update form state and avoid duplicates on retry.
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

  // Settle all operations individually so partial successes are captured
  const deleteOp =
    toDelete.length > 0
      ? fetch(baseUrl, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ triggerIds: toDelete }),
        }).then(
          (r) => ({ ok: r.ok, response: r }),
          () => ({ ok: false, response: null })
        )
      : null;

  const createResults = await Promise.all(
    toCreate.map((trigger) =>
      fetch(baseUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filters: trigger.filters, mode: trigger.mode ?? 0 }),
      }).then(
        (r) => ({ ok: r.ok, response: r }),
        () => ({ ok: false, response: null })
      )
    )
  );

  const updateResults = await Promise.all(
    toUpdate.map((trigger) =>
      fetch(baseUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggerId: trigger.id, filters: trigger.filters, mode: trigger.mode ?? 0 }),
      }).then(
        (r) => ({ ok: r.ok, response: r }),
        () => ({ ok: false, response: null })
      )
    )
  );

  if (deleteOp) {
    await deleteOp;
  }

  // Parse created trigger responses to get server-assigned IDs (only for successes)
  const createdTriggers: (TriggerFormItem | null)[] = await Promise.all(
    createResults.map(async (result) => {
      if (result.ok && result.response) {
        const body = (await result.response.json()) as {
          id: string;
          filters: TriggerFormItem["filters"];
          mode: number;
        };
        return { id: body.id, filters: body.filters, mode: body.mode ?? 0 };
      }
      return null;
    })
  );

  // Rebuild the list in original order, replacing new triggers with their server-assigned versions
  let createIndex = 0;
  const syncedTriggers = triggers
    .filter((t) => t.filters.length > 0)
    .map((t) => {
      if (!t.id) {
        const created = createdTriggers[createIndex++];
        return created ?? t; // Keep original (no id) if create failed
      }
      return t;
    });

  // Check if any operation failed
  const allResults = [...(deleteOp ? [await deleteOp] : []), ...createResults, ...updateResults];
  const hasFailures = allResults.some((r) => !r.ok);
  if (hasFailures) {
    throw new SyncError("Failed to sync one or more triggers", syncedTriggers);
  }

  return syncedTriggers;
}

class SyncError extends Error {
  constructor(
    message: string,
    public readonly partialTriggers: TriggerFormItem[]
  ) {
    super(message);
  }
}

export default function useSubmitHandler({
  projectId,
  toast,
  onSubmitComplete,
  onSuccess,
  setIsLoading,
  previousTriggerIds,
  setFormId,
  setFormTriggers,
}: {
  projectId: string;
  toast: ReturnType<typeof useToast>["toast"];
  onSubmitComplete: (data: ManageSignalForm) => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  setIsLoading: (loading: boolean) => void;
  previousTriggerIds: string[];
  setFormId: (id: string) => void;
  setFormTriggers: (triggers: TriggerFormItem[]) => void;
}) {
  return useCallback(
    async (data: ManageSignalForm) => {
      try {
        setIsLoading(true);
        const structuredOutput = schemaFieldsToJsonSchema(data.schemaFields);
        const signal = {
          name: data.name,
          prompt: data.prompt,
          structuredOutput,
          sampleRate: data.sampleRate ?? null,
          color: data.color ?? null,
        };
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

        // Write the ID back to form state so retries after trigger sync failure become updates, not creates
        if (!isUpdate) {
          setFormId(signalId);
        }

        // Sync triggers and get back the list with server-assigned IDs
        const triggersToSync = data.triggers.filter((t) => t.filters.length > 0);
        let syncedTriggers = triggersToSync;
        if (triggersToSync.length > 0 || previousTriggerIds.length > 0) {
          syncedTriggers = await syncTriggers(projectId, signalId, triggersToSync, isUpdate ? previousTriggerIds : []);
        }

        if (isUpdate) {
          track("signals", "edited");
        } else {
          track("signals", "created", { filter_count: syncedTriggers.reduce((sum, t) => sum + t.filters.length, 0) });
        }
        const savedData: ManageSignalForm = { ...data, id: signalId, triggers: syncedTriggers };
        if (onSuccess) await onSuccess(savedData);
        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} signal` });
        onSubmitComplete(savedData);
      } catch (e) {
        // On partial trigger sync failure, write successfully created trigger IDs back to form
        // so retries don't re-create triggers that already exist
        if (e instanceof SyncError) {
          setFormTriggers(e.partialTriggers);
        }
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
    [projectId, toast, onSubmitComplete, onSuccess, setIsLoading, previousTriggerIds, setFormId, setFormTriggers]
  );
}
