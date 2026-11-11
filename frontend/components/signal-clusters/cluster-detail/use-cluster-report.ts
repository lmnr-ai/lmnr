"use client";

import { useCallback } from "react";
import useSWR from "swr";

import { type ClusterReport, REPORT_STALE_MINUTES } from "@/lib/actions/signal-clusters/types";
import { fetchApi, swrFetcher } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

const POLL_MS = 5000;

const isWriting = (report: ClusterReport | undefined) =>
  report?.status === "pending" && Date.now() - new Date(report.updatedAt).getTime() < REPORT_STALE_MINUTES * 60_000;

/** The cluster's agent reports, newest first, polled while one is being written, and a way to start one. */
export function useClusterReports(projectId: string, signalId: string, clusterId: string) {
  const { toast } = useToast();
  const url = `/api/projects/${projectId}/signals/${signalId}/clusters/${clusterId}/report`;
  const { data, isLoading, mutate } = useSWR<ClusterReport[]>(url, swrFetcher, {
    refreshInterval: (latest) => (isWriting(latest?.[0]) ? POLL_MS : 0),
  });

  const generate = useCallback(async () => {
    const { error } = await fetchApi(url, { method: "POST" });
    if (error) {
      toast({ variant: "destructive", title: "Couldn't start the report", description: error });
      return;
    }
    await mutate();
  }, [url, toast, mutate]);

  const reports = data ?? [];
  return { reports, latest: reports[0] ?? null, isLoading, writing: isWriting(reports[0]), generate };
}
