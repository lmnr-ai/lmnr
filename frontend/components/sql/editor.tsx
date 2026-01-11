"use client";

import CodeMirror from "@uiw/react-codemirror";
import { debounce } from "lodash";
import { Plus, SquareTerminal } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo } from "react";
import { useSWRConfig } from "swr";
import { v4 } from "uuid";

import { type SQLTemplate, useSqlEditorStore } from "@/components/sql/sql-editor-store";
import { extensions, theme } from "@/components/sql/utils";
import { Button } from "@/components/ui/button";
import { useToast } from "@/lib/hooks/use-toast";

interface SQLEditorProps {
  className?: string;
}

export default function SQLEditor({ className }: SQLEditorProps) {
  const { projectId, id } = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const { template, onChange } = useSqlEditorStore((state) => ({
    template: state.currentTemplate,
    onChange: state.onCurrentTemplateChange,
  }));

  // Extract stable values to avoid recreating the callback on every keystroke
  const templateId = template?.id;
  const templateName = template?.name;

  const autoSaveTemplate = useCallback(
    async (query: string) => {
      if (!query.trim()) return;

      try {
        if (templateId && id) {
          await fetch(`/api/projects/${projectId}/sql/templates/${templateId}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: templateName,
              query: query,
            }),
          });
        }
      } catch (error) {
        toast({
          title: "Save failed",
          description: "Failed to save template. Please try again.",
          variant: "destructive",
        });
      }
    },
    [projectId, templateId, templateName, id, toast]
  );

  const handleCreate = useCallback(async () => {
    const optimisticData: SQLTemplate = {
      id: v4(),
      name: "Untitled Query",
      query: "",
      createdAt: new Date().toISOString(),
      projectId: projectId as string,
    };

    await mutate<SQLTemplate[]>(
      `/api/projects/${projectId}/sql/templates`,
      (currentData = []) => [optimisticData, ...currentData],
      {
        revalidate: false,
      }
    );

    router.push(`/project/${projectId}/sql/${optimisticData.id}`);

    await fetch(`/api/projects/${projectId}/sql/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: optimisticData.id,
        name: `Untitled Query`,
        query: optimisticData.query,
      }),
    });
  }, [mutate, projectId, router]);

  const debouncedAutoSave = useMemo(() => debounce(autoSaveTemplate, 500), [autoSaveTemplate]);

  const handleQueryChange = useCallback(
    (query: string) => {
      onChange(query);

      if (query !== template?.query && query.trim()) {
        debouncedAutoSave(query);
      }
    },
    [onChange, debouncedAutoSave, template?.query]
  );

  useEffect(
    () => () => {
      debouncedAutoSave.cancel();
    },
    [debouncedAutoSave]
  );

  return (
    <div className="flex border rounded bg-secondary overflow-auto w-full h-full">
      {template ? (
        <CodeMirror
          placeholder="Enter your SQL query..."
          theme={theme}
          className="size-full"
          extensions={extensions}
          editable
          autoFocus
          value={template?.query}
          onChange={handleQueryChange}
        />
      ) : (
        <div className="flex items-center justify-center w-full h-full">
          <div className="text-center space-y-4">
            <SquareTerminal className="w-12 h-12 text-muted-foreground mx-auto" />
            <div>
              <h3 className="text-lg font-medium text-foreground mb-2">No query selected</h3>
              <p className="text-sm text-muted-foreground">Create a new query or select one from the sidebar</p>
            </div>
            <Button onClick={handleCreate} variant="secondaryLight" size="sm" className="gap-2">
              <Plus className="w-4 h-4" />
              New Query
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
