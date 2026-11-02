"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import React, { useEffect } from "react";
import useSWR from "swr";

import Sidebar from "@/components/sql/sidebar";
import { type SQLTemplate } from "@/components/sql/sql-editor-store";
import { ElevatedSurface } from "@/components/ui/surface";
import { track } from "@/lib/posthog";
import { swrFetcher } from "@/lib/utils";

// Client-only: the panel restores its split from localStorage, which the server cannot read.
const SQLEditorPanel = dynamic(() => import("@/components/sql/editor-panel.tsx").then((mod) => mod.default), {
  ssr: false,
  loading: () => <ElevatedSurface className="h-full w-full rounded-xl border" />,
});

const SQLTemplates = () => {
  const { projectId } = useParams();
  const { data = [], isLoading } = useSWR<SQLTemplate[]>(`/api/projects/${projectId}/sql/templates`, swrFetcher);

  useEffect(() => {
    track("sql_editor", "page_viewed");
  }, []);

  return (
    <div className="flex min-h-0 flex-1 gap-3 px-4 pb-4">
      <Sidebar isLoading={isLoading} templates={data} />
      <div className="flex min-w-0 flex-1 overflow-hidden">
        <SQLEditorPanel />
      </div>
    </div>
  );
};

export default SQLTemplates;
