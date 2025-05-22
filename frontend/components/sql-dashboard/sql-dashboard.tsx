"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Braces,Table2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback,useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import CodeEditor from "@/components/ui/code-editor";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { DataTable } from "@/components/ui/datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { useToast } from "@/lib/hooks/use-toast";

import Header from "../ui/header";
import { Label } from "../ui/label";
import ExportResultsDialog from "./export-results-dialog";

const QUERY_STORAGE_KEY = "sql-dashboard-query";

export default function SqlDashboard() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnDef<any>[]>([]);
  const [viewMode, setViewMode] = useState<"table" | "json">("table");
  const { toast } = useToast();

  // Load query from localStorage on component mount
  useEffect(() => {
    const savedQuery = localStorage.getItem(QUERY_STORAGE_KEY);
    if (savedQuery) {
      setQuery(savedQuery);
    }
  }, []);

  // Save query to localStorage when it changes
  const handleQueryChange = (value: string) => {
    setQuery(value);
    localStorage.setItem(QUERY_STORAGE_KEY, value);
  };

  const executeQuery = async () => {
    console.log('executing query');
    if (!query.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sqlQuery: query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to execute query');
      }

      if (data.warnings) {
        toast({
          title: "Warning",
          description: data.warnings.join('\n'),
          variant: "default"
        });
      }

      setResults(data.result);
      if (data.result && data.result.length > 0) {
        setColumns(Object.keys(data.result[0]).map((column: string) => ({
          header: column,
          accessorFn: (row: any) => {
            const value = row[column];
            if (typeof value === 'object' && value !== null) {
              const fullValue = JSON.stringify(value);
              if (fullValue.length > 100) {
                return fullValue.slice(0, 100) + '...';
              }
              return fullValue;
            }
            return value;
          }
        })));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setResults(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditorKeyDown = useCallback((event: React.KeyboardEvent) => {
    // TODO: fix this
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      executeQuery();
    }
  }, [executeQuery]);

  return (
    <div className="h-full flex flex-col">
      <Header path="SQL Console" />
      <div className="flex-grow flex flex-col">
        <ResizablePanelGroup direction="vertical" className="flex-grow border rounded">
          <ResizablePanel defaultSize={40} minSize={20}>
            <div className="h-full flex flex-col p-2">
              <h2 className="text-lg font-semibold mb-2">Query</h2>
              <div
                className="w-full flex-grow"
                onKeyDown={handleEditorKeyDown}
              >
                <CodeEditor
                  editable
                  value={query}
                  onChange={handleQueryChange}
                  language="sql"
                  className="w-full h-full font-mono"
                  placeholder="Enter your SQL query here..."
                />
              </div>
            </div>
          </ResizablePanel>

          <ResizableHandle withHandle />

          <ResizablePanel defaultSize={60} minSize={20}>
            <div className="h-full flex flex-col">
              <div className="border-b p-2 flex justify-between items-center">
                <div className="text-lg font-semibold flex gap-4 items-center">
                  <span>Results</span>
                  <div className="flex border gap-2 rounded overflow-hidden">
                    <Button
                      variant={viewMode === "table" ? "default" : "ghost"}
                      size="sm"
                      className="rounded-none py-1 h-8"
                      onClick={() => setViewMode("table")}
                    >
                      <Table2 className="h-4 w-4 mr-1" />
                      <span className="text-xs">Table</span>
                    </Button>
                    <Button
                      variant={viewMode === "json" ? "default" : "ghost"}
                      size="sm"
                      className="rounded-none py-1 h-8"
                      onClick={() => setViewMode("json")}
                    >
                      <Braces className="h-4 w-4 mr-1" />
                      <span className="text-xs">Raw JSON</span>
                    </Button>
                  </div>
                  <Label className="text-xs text-muted-foreground">
                    {results && `${results.length} rows`}
                  </Label>
                </div>
                <div className="flex space-x-2">
                  {results && results.length > 0 && (
                    <ExportResultsDialog
                      results={results}
                      projectId={projectId}
                    />
                  )}

                  <Button
                    onClick={executeQuery}
                    disabled={isLoading || !query.trim()}
                    handleKeys={[
                      { key: 'Enter', ctrlKey: true },
                      { key: 'Enter', metaKey: true }
                    ]}
                  >
                    {isLoading ? 'Executing...' : 'Execute Query'}
                  </Button>
                </div>
              </div>

              <div className="flex-grow overflow-auto p-2">
                {error && (
                  <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
                    {error}
                  </div>
                )}

                {results && !error && (
                  <>
                    {viewMode === "table" ? (
                      <DataTable
                        columns={columns}
                        data={results}
                        paginated
                      />
                    ) : (
                      <CodeHighlighter
                        value={JSON.stringify(results, null, 2)}
                        defaultMode="json"
                        className="overflow-auto"
                      />
                    )}
                  </>
                )}

                {!results && !error && (
                  <div className="text-center text-gray-500 mt-4">
                    Execute a query to see results
                  </div>
                )}
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
