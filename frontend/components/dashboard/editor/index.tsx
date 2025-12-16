"use client";

import { useParams } from "next/navigation";
import React from "react";

import ChartBuilder from "@/components/dashboard/editor/builder";
import { DashboardEditorStoreProvider } from "@/components/dashboard/editor/dashboard-editor-store";
import { DashboardChart } from "@/components/dashboard/types";
import Header from "@/components/ui/header";

const DashboardEditor = ({ chart }: { chart?: DashboardChart }) => {
  const { id } = useParams();

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
