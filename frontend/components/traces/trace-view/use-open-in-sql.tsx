import { useCallback, useState } from "react";
import { v4 } from "uuid";

import { type SQLTemplate } from "@/components/sql/sql-editor-store.ts";
import { useToast } from "@/lib/hooks/use-toast.ts";

type Params = { type: "span"; spanId: string } | { type: "trace"; traceId: string };

function buildQuery(params: Params): { query: string; name: string } {
  switch (params.type) {
    case "span":
      return {
        query: `SELECT *\nFROM spans\nWHERE span_id = '${params.spanId}'`,
        name: `Span ${params.spanId}`,
      };
    case "trace":
      return {
        query: `SELECT *\nFROM spans\nWHERE trace_id = '${params.traceId}'\nORDER BY start_time ASC`,
        name: `Trace ${params.traceId}`,
      };
  }
}

export const useOpenInSql = ({ projectId, params }: { projectId: string; params: Params }) => {
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const { query, name } = buildQuery(params);

  const openInSql = useCallback(async () => {
    try {
      const optimisticData: SQLTemplate = {
        id: v4(),
        name,
        query,
        createdAt: new Date().toISOString(),
        projectId,
      };

      setIsLoading(true);

      const res = await fetch(`/api/projects/${projectId}/sql/templates`, {
        method: "POST",
        body: JSON.stringify({
          id: optimisticData.id,
          name: optimisticData.name,
          query: optimisticData.query,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        toast({
          variant: "destructive",
          title: "Error",
          description: errorData.error || "Failed to open in sql.",
        });
        return;
      }

      window.open(`/project/${projectId}/sql/${optimisticData.id}`, "_blank");
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    } finally {
      setIsLoading(false);
    }
  }, [projectId]);

  return { isLoading, openInSql };
};
