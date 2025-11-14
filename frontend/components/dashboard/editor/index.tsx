"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React from "react";
import useSWR from "swr";

import ChartBuilder from "@/components/dashboard/editor/Builder";
import { DashboardEditorStoreProvider } from "@/components/dashboard/editor/dashboard-editor-store";
import { DashboardChart } from "@/components/dashboard/types";
import Header from "@/components/ui/header";
import { swrFetcher } from "@/lib/utils";

const DashboardEditor = () => {
  const { id, projectId } = useParams();

  const shouldFetch = id && id !== "new";

  const { data: chart, isLoading } = useSWR<DashboardChart>(
    shouldFetch ? `/api/projects/${projectId}/dashboard-charts/${id}` : null,
    swrFetcher
  );

  if (isLoading) {
    return (
      <>
        <Header path={`dashboard/${id}`} />

        <div className="flex-1 overflow-hidden px-4 pb-4">
          <div className="flex flex-col h-full justify-center items-center">
            <Loader2 className="animate-spin h-10 w-10 text-primary" />
          </div>
        </div>
      </>
    );
  }

  return (
    <DashboardEditorStoreProvider chart={chart}>
      <Header path={`dashboard/${id}`} />
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <ChartBuilder />
      </div>
    </DashboardEditorStoreProvider>
  );
};

export default DashboardEditor;
