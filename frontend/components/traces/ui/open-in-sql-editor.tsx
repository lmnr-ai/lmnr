import { Database } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React from "react";
import { mutate } from "swr";
import { v4 } from "uuid";

import { SQLTemplate } from "@/components/sql/sql-editor-store.ts";
import { Button } from "@/components/ui/button.tsx";

interface OpenInSqlEditorProps {
  spanId: string;
}

export function OpenInSqlEditor({ spanId }: OpenInSqlEditorProps) {
  const { projectId } = useParams();

  const router = useRouter();

  const handleOpenInSqlEditor = async () => {
    const query = `SELECT *\nFROM spans\nWHERE span_id = '${spanId}'`;

    const optimisticData: SQLTemplate = {
      id: v4(),
      name: `Span ${spanId}`,
      query: query,
      createdAt: new Date().toISOString(),
      projectId: projectId as string,
    };

    await mutate<SQLTemplate[]>(
      `/api/projects/${projectId}/sql/templates`,
      (currentData = []) => [optimisticData, ...currentData],
      { revalidate: false }
    );

    router.push(`/project/${projectId}/sql/${optimisticData.id}`);

    await fetch(`/api/projects/${projectId}/sql/templates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: optimisticData.id,
        name: optimisticData.name,
        query: optimisticData.query,
      }),
    });
  };
  return (
    <Button variant="secondary" className="px-1.5 text-xs h-6 font-mono" onClick={handleOpenInSqlEditor}>
      <Database className="mr-1" size={14} />
      Open in SQL editor
    </Button>
  );
}
