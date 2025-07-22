"use client";

import { useParams } from "next/navigation";
import React from "react";
import useSWR from "swr";

import SQLEditor from "@/components/sql/editor";
import Sidebar from "@/components/sql/sidebar";
import { SQLTemplate } from "@/components/sql/sql-editor-store";
import { swrFetcher } from "@/lib/utils";

const SQLTemplates = () => {
  const { projectId } = useParams();
  const { data = [], isLoading } = useSWR<SQLTemplate[]>(`/api/projects/${projectId}/sql/templates`, swrFetcher);

  return (
    <div className="flex flex-1 divide-x">
      <Sidebar isLoading={isLoading} templates={data} />
      <div className="flex-1">
        <SQLEditor />
      </div>
    </div>
  );
};

export default SQLTemplates;
