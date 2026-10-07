import { useCallback } from "react";
import { useSWRConfig } from "swr";

import { signalVersionsKey } from "@/components/signal/hooks/use-signal-version-markers";
import { stripBlankSpanNames } from "@/components/signals/trigger-filter-field";
import { schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { type useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

import { type ManageSignalForm, type TriggerFormItem } from "./types";

export default function useSubmitHandler({
  projectId,
  toast,
  onSubmitComplete,
  onSuccess,
  setIsLoading,
  setFormId,
  setFormTriggers,
}: {
  projectId: string;
  toast: ReturnType<typeof useToast>["toast"];
  onSubmitComplete: (data: ManageSignalForm) => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  setIsLoading: (loading: boolean) => void;
  setFormId: (id: string) => void;
  setFormTriggers: (triggers: TriggerFormItem[]) => void;
}) {
  const { mutate } = useSWRConfig();

  return useCallback(
    async (data: ManageSignalForm) => {
      try {
        setIsLoading(true);

        // A trigger with no conditions never fires, so a signal saved without
        // one looks configured but is silently inert. Normally unreachable
        // (the form always seeds a trigger and the kind selector can't empty
        // it); this catches a signal whose trigger rows are already missing.
        // `filters` may legitimately be empty.
        if (data.triggers.some((t) => !t.conditions?.length)) {
          toast({
            variant: "destructive",
            title: "Error",
            description: "Select a trigger before saving — a signal without one would never run.",
          });
          return;
        }

        const structuredOutput = schemaFieldsToJsonSchema(data.schemaFields);
        const isUpdate = !!data.id;
        // Both route fields travel together; an unset pair means "env LLM" for
        // legacy signals (create requires it server-side on self-hosted).
        const hasProfile = !!data.llmProfileId && !!data.llmModel;
        const payload = {
          name: data.name,
          prompt: data.prompt,
          structuredOutput,
          sampleRate: data.sampleRate ?? null,
          disabled: data.disabled ?? false,
          ...(hasProfile ? { llmProfileId: data.llmProfileId, llmModel: data.llmModel } : {}),
          triggers: data.triggers.map((trigger) => ({
            id: trigger.id,
            conditions: stripBlankSpanNames(trigger.conditions),
            filters: trigger.filters,
            mode: trigger.mode ?? 0,
          })),
        };

        const url = isUpdate ? `/api/projects/${projectId}/signals/${data.id}` : `/api/projects/${projectId}/signals`;
        const method = isUpdate ? "PUT" : "POST";

        const res = await fetch(url, {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
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

        const body = (await res.json()) as { id: string; triggers?: TriggerFormItem[] };
        const signalId = isUpdate ? data.id! : body.id;
        const syncedTriggers = body.triggers ?? data.triggers;

        if (!isUpdate) {
          setFormId(signalId);
        }
        setFormTriggers(syncedTriggers);

        if (isUpdate) {
          track("signals", "edited");
        } else {
          track("signals", "created", { filter_count: syncedTriggers.reduce((sum, t) => sum + t.filters.length, 0) });
        }

        void mutate(signalVersionsKey(projectId, signalId));

        const savedData: ManageSignalForm = { ...data, id: signalId, triggers: syncedTriggers };
        if (onSuccess) await onSuccess(savedData);
        toast({ title: `Successfully ${isUpdate ? "updated" : "created"} signal` });
        onSubmitComplete(savedData);
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
    [projectId, toast, onSubmitComplete, onSuccess, setIsLoading, setFormId, setFormTriggers, mutate]
  );
}
