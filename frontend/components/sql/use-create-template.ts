"use client";

import { useParams, useRouter } from "next/navigation";
import { useCallback } from "react";
import { useSWRConfig } from "swr";
import { v4 } from "uuid";

import { type SQLTemplate } from "@/components/sql/sql-editor-store";
import { useToast } from "@/lib/hooks/use-toast";

/**
 * Creates an empty saved query, navigating to it immediately off an optimistic list entry so the id
 * the editor autosaves against is the one the server ends up storing.
 */
export const useCreateTemplate = () => {
  const { projectId } = useParams();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  return useCallback(async () => {
    const optimisticData: SQLTemplate = {
      id: v4(),
      name: "Untitled Query",
      query: "",
      createdAt: new Date().toISOString(),
      projectId: projectId as string,
    };

    await mutate<SQLTemplate[]>(
      `/api/projects/${projectId}/sql/templates`,
      (currentData = []) => [optimisticData, ...currentData],
      { revalidate: false }
    );

    router.push(`/project/${projectId}/sql/${optimisticData.id}`);

    try {
      const res = await fetch(`/api/projects/${projectId}/sql/templates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: optimisticData.id,
          name: optimisticData.name,
          query: optimisticData.query,
        }),
      });

      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: errMessage ?? "Failed to create query" });
      }
    } catch {
      toast({ variant: "destructive", title: "Failed to create query" });
    }
  }, [mutate, projectId, router, toast]);
};
