"use client";

import { sql } from "@codemirror/lang-sql";
import { ColumnDef } from "@tanstack/react-table";
import { createTheme } from "@uiw/codemirror-themes";
import CodeMirror from "@uiw/react-codemirror";
import { debounce, isEmpty } from "lodash";
import { FileJson2, Loader2, PlayIcon, TableProperties } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { useSWRConfig } from "swr";
import { v4 } from "uuid";

import ExportSqlDialog from "@/components/sql/export-sql-dialog";
import { SQLTemplate, useSqlEditorStore } from "@/components/sql/sql-editor-store";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { defaultThemeSettings, githubDarkStyle } from "@/components/ui/code-highlighter/utils";
import { DataTable } from "@/components/ui/datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";

const theme = createTheme({
  theme: "dark",
  settings: {
    ...defaultThemeSettings,
    fontSize: 14,
  },
  styles: githubDarkStyle,
});

export default function SQLEditor() {
  const { projectId, id } = useParams();
  const { push } = useRouter();
  const [results, setResults] = useState<Record<string, any>[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnDef<any>[]>([]);
  const { toast } = useToast();
  const { mutate } = useSWRConfig();
  const { template, setCurrentTemplate, onChange } = useSqlEditorStore((state) => ({
    template: state.currentTemplate,
    onChange: state.onCurrentTemplateChange,
    setCurrentTemplate: state.setCurrentTemplate,
  }));

  const executeQuery = useCallback(async () => {
    if (!template?.query.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sqlQuery: template?.query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to execute query");
      }

      if (!isEmpty(data.warnings)) {
        toast({
          title: "Warning",
          description: data.warnings.join("\n"),
          variant: "default",
        });
      }

      if (data.error) {
        setError(data.error);
        return;
      }

      setResults(data.result);
      if (data.result && data.result.length > 0) {
        setColumns(
          Object.keys(data.result[0]).map((column: string) => ({
            header: column,
            accessorFn: (row: any) => {
              const value = row[column];
              if (typeof value === "object" && value !== null) {
                const fullValue = JSON.stringify(value);
                if (fullValue.length > 100) {
                  return fullValue.slice(0, 100) + "...";
                }
                return fullValue;
              }
              return value;
            },
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to query data. Please try again.");
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, template?.query, toast]);

  const autoSaveTemplate = useCallback(
    async (query: string) => {
      if (!query.trim()) return;

      const templatesKey = `/api/projects/${projectId}/sql/templates`;

      try {
        if (!template?.id || !id) {
          const optimisticData: SQLTemplate = {
            id: v4(),
            name: "Untitled Query",
            query: query,
            createdAt: new Date().toISOString(),
            projectId: projectId as string,
          };
          push(`/project/${projectId}/sql/${optimisticData.id}`);
          setCurrentTemplate(optimisticData);
          await mutate<SQLTemplate[]>(templatesKey, (currentData = []) => [optimisticData, ...currentData], {
            revalidate: false,
          });

          await fetch(`/api/projects/${projectId}/sql/templates`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              id: optimisticData.id,
              name: `Untitled Query`,
              query: query,
            }),
          });
        } else {
          await fetch(`/api/projects/${projectId}/sql/templates/${template.id}`, {
            method: "PUT",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              name: template.name,
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
    [projectId, template, id, push, mutate, toast]
  );

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

  useEffect(() => {
    debouncedAutoSave.cancel();
  }, [debouncedAutoSave]);

  useHotkeys("meta+enter,ctrl+enter", executeQuery, {
    enableOnFormTags: ["input", "textarea"],
    enableOnContentEditable: true,
  });

  return (
    <ResizablePanelGroup direction="vertical" className="flex-grow overflow-hidden">
      <ResizablePanel className="h-full flex flex-col" defaultSize={40} minSize={20}>
        <div className="flex-grow flex bg-muted/50 overflow-auto w-full h-full pl-1">
          <CodeMirror
            placeholder="Enter your SQL query here..."
            theme={theme}
            className="h-full"
            extensions={[sql()]}
            editable
            value={template?.query}
            onChange={handleQueryChange}
          />
        </div>
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel className="flex flex-col flex-1 overflow-hidden" defaultSize={60} minSize={20}>
        <Tabs className="flex flex-1 flex-col overflow-hidden" defaultValue="table">
          <div className="flex items-center justify-between border-b px-4">
            <TabsList className="border-b-0 text-sm">
              <TabsTrigger value="table">
                <TableProperties className="mr-2 w-4 h-4" />
                <span>Table</span>
              </TabsTrigger>
              <TabsTrigger value="json">
                <FileJson2 className="mr-2 w-4 h-4" />
                <span>JSON</span>
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2 py-2">
              <ExportSqlDialog results={results} sqlQuery={template?.query || ""} />
              <Button
                disabled={isLoading || !template?.query.trim()}
                onClick={executeQuery}
                className="ml-auto w-fit px-2"
              >
                {isLoading ? (
                  <Loader2 size={14} className="mr-1 animate-spin" />
                ) : (
                  <PlayIcon size={14} className="mr-1" />
                )}
                <span className="mr-2">Run</span>
                <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
              </Button>
            </div>
          </div>

          <TabsContent className="h-full" value="table">
            {!results && !error && <div className="text-center text-gray-500 mt-4">Execute a query to see results</div>}
            {results && !error && <DataTable className="border-t-0" columns={columns} data={results} paginated />}
            {error && <div className="text-center text-red-500 mt-4">{error}</div>}
          </TabsContent>
          <TabsContent className="flex flex-1 overflow-hidden" value="json">
            {!results && !error && (
              <div className="text-center text-gray-500 mt-4 mx-auto">Execute a query to see results</div>
            )}
            {results && !error && (
              <div className="flex flex-1 overflow-hidden">
                <CodeHighlighter
                  readOnly
                  className="border-0"
                  value={JSON.stringify(results, null, 2)}
                  defaultMode="json"
                />
              </div>
            )}
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
