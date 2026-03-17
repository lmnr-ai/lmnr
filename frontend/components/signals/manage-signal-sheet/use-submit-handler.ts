import { useCallback } from "react";

import { schemaFieldsToJsonSchema } from "@/components/signals/utils";
import { type useToast } from "@/lib/hooks/use-toast";

import { getDefaultValues, type ManageSignalForm } from "./types";

export default function useSubmitHandler({
  projectId,
  toast,
  setOpen,
  reset,
  onSuccess,
  setIsLoading,
}: {
  projectId: string;
  toast: ReturnType<typeof useToast>["toast"];
  setOpen: (open: boolean) => void;
  reset: (values: ManageSignalForm) => void;
  onSuccess?: (signal: ManageSignalForm) => Promise<void>;
  setIsLoading: (loading: boolean) => void;
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

        if (onSuccess) await onSuccess(data);
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
    [projectId, toast, setOpen, reset, onSuccess, setIsLoading]
  );
}
