import { useCallback } from "react";

export type RunDashboardQuery = (
  query: string,
  parameters: Record<string, string | number>,
  signal?: AbortSignal
) => Promise<Record<string, any>[]>;

export const useRunDashboardQuery = (projectId: string): RunDashboardQuery =>
  useCallback<RunDashboardQuery>(
    async (query, parameters, signal) => {
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, projectId, parameters }),
        signal,
      });

      if (!response.ok) {
        throw new Error("Failed to execute SQL query");
      }

      return response.json();
    },
    [projectId]
  );
