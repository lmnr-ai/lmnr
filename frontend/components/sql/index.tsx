"use client";

import { useParams } from "next/navigation";
import React from "react";
import useSWR from "swr";

import SQLEditorPanel from "@/components/sql/editor-panel";
import Sidebar from "@/components/sql/sidebar";
import { SQLTemplate } from "@/components/sql/sql-editor-store";
import { swrFetcher } from "@/lib/utils";

const SQLTemplates = () => {
  const { projectId } = useParams();
  const { data = [], isLoading } = useSWR<SQLTemplate[]>(`/api/projects/${projectId}/sql/templates`, swrFetcher);

  return (
    <div className="flex flex-1 divide-x gap-x-4 px-4 pb-4">
      <Sidebar isLoading={isLoading} templates={data} />
      <div className="flex flex-1 overflow-hidden">
        <SQLEditorPanel />
      </div>
    </div>
  );
};

export default SQLTemplates;
