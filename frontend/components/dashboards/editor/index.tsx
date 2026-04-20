"use client";

import { useParams } from "next/navigation";
import React, { useEffect } from "react";

import ChartBuilder from "@/components/dashboards/editor/Builder";
import { DashboardEditorStoreProvider } from "@/components/dashboards/editor/dashboard-editor-store";
import { type DashboardChart } from "@/components/dashboards/types";
import Header from "@/components/ui/header";
import { track } from "@/lib/posthog";

const DashboardEditor = ({ chart }: { chart?: DashboardChart }) => {
  const { id, projectId } = useParams();

  useEffect(() => {
    track("dashboards", "editor_opened", { is_new: id === "new" });
  }, [id]);

  return (
    <DashboardEditorStoreProvider chart={chart}>
      <Header
        path={[{ name: "Dashboards", href: `/project/${projectId}/dashboards` }, { name: String(chart?.name ?? id) }]}
      />
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <ChartBuilder />
      </div>
    </DashboardEditorStoreProvider>
  );
};

export default DashboardEditor;
