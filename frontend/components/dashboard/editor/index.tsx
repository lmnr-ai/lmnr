"use client";

import { useParams } from "next/navigation";
import React, { useEffect } from "react";

import ChartBuilder from "@/components/dashboard/editor/Builder";
import { DashboardEditorStoreProvider } from "@/components/dashboard/editor/dashboard-editor-store";
import { type DashboardChart } from "@/components/dashboard/types";
import Header from "@/components/ui/header";
import { track } from "@/lib/analytics";

const DashboardEditor = ({ chart }: { chart?: DashboardChart }) => {
  const { id } = useParams();

  useEffect(() => {
    track("dashboards", "editor_opened", { is_new: id === "new" });
  }, [id]);

  return (
    <DashboardEditorStoreProvider chart={chart}>
      <Header path={`dashboard/${chart?.name ?? id}`} />
      <div className="flex-1 overflow-hidden px-4 pb-4">
        <ChartBuilder />
      </div>
    </DashboardEditorStoreProvider>
  );
};

export default DashboardEditor;
