"use client";

import { ColumnDef } from "@tanstack/react-table";
import { isEmpty } from "lodash";
import { Database, FileJson2, Loader2, PlayIcon, TableProperties, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import { useSQLEditorContext } from "@/components/sql/context";
import ExportSqlDialog from "@/components/sql/export-sql-dialog";
import { Button } from "@/components/ui/button";
import CodeEditor from "@/components/ui/code-editor";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { DataTable } from "@/components/ui/datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";
import { Badge } from "../ui/badge";

const QUERY_STORAGE_KEY = "sql-dashboard-query";

export default function SQLEditor() {
  const { projectId } = useParams();
  const { setOpen } = useSQLEditorContext();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnDef<any>[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedQuery = localStorage.getItem(QUERY_STORAGE_KEY);
      if (savedQuery) {
        setQuery(savedQuery);
      }
    }
  }, []);

  const handleQueryChange = useCallback((value: string) => {
    setQuery(value);
    localStorage.setItem(QUERY_STORAGE_KEY, value);
  }, []);

  const executeQuery = useCallback(async () => {
    if (!query.trim()) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sqlQuery: query }),
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
  }, [projectId, query, toast]);

  useHotkeys("meta+enter,ctrl+enter", executeQuery, {
    enableOnFormTags: ["input", "textarea"],
    enableOnContentEditable: true,
  });

  return (
    <ResizablePanelGroup direction="vertical" className="flex-grow overflow-hidden">
      <ResizablePanel className="h-full flex flex-col" defaultSize={40} minSize={20}>
        <div className="flex items-center border-b min-h-12 px-2">
          <h2 className="text-lg font-semibold flex items-center">
            SQL Editor
            <Badge className="ml-2" variant="outlinePrimary">
              Beta
            </Badge>
          </h2>
          <Button onClick={() => setOpen(false)} className="p-1 h-fit ml-auto" variant="outline">
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="overflow-hidden h-full">
          <CodeEditor
            editable
            value={query}
            onChange={handleQueryChange}
            language="sql"
            className="w-full h-full font-mono"
            placeholder="Enter your SQL query here..."
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
              <ExportSqlDialog results={results}>
                <Button variant="secondary" className="w-fit px-2">
                  <Database className="size-3.5 mr-2" />
                  Export to Dataset
                </Button>
              </ExportSqlDialog>
              <Button disabled={isLoading || !query.trim()} onClick={executeQuery} className="ml-auto w-fit px-2">
                {isLoading ? <Loader2 size={14} className="mr-1 animate-spin" /> : <PlayIcon size={14} className="mr-1" />}
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
