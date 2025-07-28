"use client";

import { ColumnDef } from "@tanstack/react-table";
import { isEmpty } from "lodash";
import { ChevronDown, Database, FileJson2, Loader2, PlayIcon, TableProperties } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import GraphBuilder from "@/components/graph-builder";
import SQLEditor from "@/components/sql/editor";
import ExportSqlDialog from "@/components/sql/export-sql-dialog";
import { useSqlEditorStore } from "@/components/sql/sql-editor-store";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { DataTable } from "@/components/ui/datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";

export default function EditorPanel() {
  const { projectId } = useParams();
  const [results, setResults] = useState<Record<string, any>[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnDef<any>[]>([]);
  const { toast } = useToast();
  const { template } = useSqlEditorStore((state) => ({
    template: state.currentTemplate,
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

  useHotkeys("meta+enter,ctrl+enter", executeQuery, {
    enableOnFormTags: ["input", "textarea"],
    enableOnContentEditable: true,
  });

  return (
    <ResizablePanelGroup direction="vertical">
      <ResizablePanel className="h-full flex flex-col" defaultSize={40} minSize={20}>
        <SQLEditor />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel className="flex flex-col" defaultSize={60} minSize={20}>
        <Tabs className="flex flex-col h-full flex-1 overflow-hidden" defaultValue="table">
          <TabsList className="border-b px-3 text-sm">
            <TabsTrigger value="table">
              <TableProperties className="mr-2 w-4 h-4" />
              <span>Table</span>
            </TabsTrigger>
            <TabsTrigger value="json">
              <FileJson2 className="mr-2 w-4 h-4" />
              <span>JSON</span>
            </TabsTrigger>
            <TabsTrigger value="chart">
              <span>Chart</span>
            </TabsTrigger>
            <div className="ml-auto py-2">
              <ExportSqlDialog results={results} sqlQuery={template?.query || ""}>
                <Button
                  disabled={!template?.query.trim()}
                  variant="secondary"
                  className="rounded-tr-none rounded-br-none border-r-0"
                >
                  <Database className="size-3.5 mr-2" />
                  Export
                  <ChevronDown className="size-3.5 ml-2" />
                </Button>
              </ExportSqlDialog>
              <Button
                disabled={isLoading || !template?.query.trim()}
                onClick={executeQuery}
                className="ml-auto px-2 rounded-tl-none rounded-bl-none"
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
          </TabsList>
          <TabsContent className="size-full" value="table">
            {!results && !error && (
              <div className="w-full text-center text-gray-500 mt-4">Execute a query to see results</div>
            )}
            {results && !error && (
              <DataTable className="border-t-0 w-full" columns={columns} data={results} paginated />
            )}
            {error && <div className="text-center text-red-500 mt-4">{error}</div>}
          </TabsContent>
          <TabsContent className="flex flex-1 overflow-hidden" value="json">
            {!results && !error && (
              <div className="w-full text-center text-gray-500 mt-4">Execute a query to see results</div>
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
          <TabsContent className="flex flex-col flex-1 overflow-hidden" value="chart">
            <div className="p-4 overflow-hidden h-full">
              <GraphBuilder data={results || []} />
            </div>
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
