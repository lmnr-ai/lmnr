"use client";

import { type ColumnDef } from "@tanstack/react-table";
import ChartBuilder from "components/chart-builder";
import { isEmpty, isNil, isObject } from "lodash";
import {
  AlertCircle,
  Braces,
  ChartArea,
  ChevronDown,
  Database,
  FileJson2,
  Loader2,
  PlayIcon,
  Square,
  TableProperties,
} from "lucide-react";
import { useParams } from "next/navigation";
import React, { type ReactNode, useCallback, useMemo, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import ExportSqlDialog from "@/components/sql/export-sql-dialog";
import ParametersPanel from "@/components/sql/parameters-panel";
import { useSqlEditorStore } from "@/components/sql/sql-editor-store";
import TemplateEditor from "@/components/sql/template-editor";
import { Button } from "@/components/ui/button";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { DataTableStateProvider } from "@/components/ui/infinite-datatable/model/datatable-store.tsx";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";

export default function EditorPanel() {
  const { projectId } = useParams();
  const [results, setResults] = useState<Record<string, any>[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const { template, getFormattedParameters, parameters, onChange } = useSqlEditorStore((state) => ({
    template: state.currentTemplate,
    getFormattedParameters: state.getFormattedParameters,
    parameters: state.parameters,
    onChange: state.setParameterValue,
  }));

  const hasQuery = Boolean(template?.query?.trim());
  const hasResults = results !== null && results.length > 0;

  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (results && !isEmpty(results)) {
      return Object.keys(results[0]).map((column) => ({
        id: column,
        header: column,
        accessorFn: (row: any) => {
          const value = row[column];
          if (isNil(value)) return "NULL";
          if (isObject(value)) {
            try {
              const serialized = JSON.stringify(value);
              return serialized.length > 100 ? `${serialized.slice(0, 100)}...` : serialized;
            } catch {
              return "[Object]";
            }
          }
          return String(value);
        },
      }));
    }
    return [];
  }, [results]);

  const cancelQuery = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
      toast({
        title: "Query cancelled.",
      });
    }
  }, [toast]);

  const executeQuery = useCallback(async () => {
    const query = template?.query?.trim();
    if (!query) {
      toast({
        title: "No query to execute",
        description: "Please enter a SQL query first.",
        variant: "destructive",
      });
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setIsLoading(true);
    setError(null);

    try {
      const parameters = getFormattedParameters();
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, parameters }),
        signal: controller.signal,
      });

      if (!response.ok) {
        let error;
        try {
          const data = await response.json();
          error = data?.error;
        } catch {
          try {
            error = await response.text();
          } catch {
            error = response.statusText !== "" ? response.statusText : "Failed to execute query";
          }
        }
        throw new Error(error);
      }

      const data = await response.json();

      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred while executing the query.";
      try {
        const error = JSON.parse(errorMessage).error;
        if (error) {
          setError(error);
        } else {
          setError(errorMessage);
        }
      } catch {
        setError(errorMessage);
      }
      setResults([]);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
        setIsLoading(false);
      }
    }
  }, [projectId, template?.query, toast, getFormattedParameters]);

  useHotkeys("meta+enter,ctrl+enter", executeQuery, {
    enableOnFormTags: ["input"],
    enableOnContentEditable: true,
  });

  const renderContent = useCallback(
    ({
      success,
      default: defaultContent,
      loadingText = "Executing query...",
    }: {
      success: ReactNode;
      default: ReactNode;
      loadingText?: string;
    }) => {
      if (isLoading) {
        return (
          <div className="flex flex-col flex-1 items-center justify-center text-muted-foreground space-y-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text">{loadingText}</p>
          </div>
        );
      }

      if (error) {
        return (
          <div className="flex flex-1 items-center justify-center h-full space-x-2 text-destructive">
            <div className="flex gap-2">
              <AlertCircle className="size-5" />
              <div className="whitespace-pre-wrap text-sm">{error}</div>
            </div>
          </div>
        );
      }

      if (hasResults) {
        return success;
      }

      if (results !== null && results.length === 0) {
        return (
          <div className="flex w-full items-center justify-center h-full text-muted-foreground">
            Query executed successfully but returned no results
          </div>
        );
      }

      return defaultContent;
    },
    [isLoading, error, hasResults, results]
  );

  return (
    <ResizablePanelGroup id="sql-editor-panels" orientation="vertical">
      <ResizablePanel className="h-full flex flex-col" defaultSize={40} minSize={20}>
        <TemplateEditor />
      </ResizablePanel>
      <ResizableHandle className="z-30 bg-transparent transition-colors duration-200" withHandle />
      <ResizablePanel className="flex flex-col w-full mt-2" defaultSize={60} minSize={20}>
        <Tabs className="flex flex-col h-full overflow-hidden" defaultValue="table">
          <div className="flex items-center h-fit">
            <TabsList className="text-xs">
              <TabsTrigger value="table">
                <TableProperties className="w-4 h-4" />
                <span>Table</span>
              </TabsTrigger>
              <TabsTrigger value="json">
                <FileJson2 className="w-4 h-4" />
                <span>JSON</span>
              </TabsTrigger>
              <TabsTrigger value="chart">
                <ChartArea className="w-4 h-4" />
                <span>Chart</span>
              </TabsTrigger>
              <TabsTrigger value="parameters">
                <Braces className="w-4 h-4" />
                <span>Parameters</span>
              </TabsTrigger>
            </TabsList>
            <div className="ml-auto">
              {isLoading ? (
                <Button onClick={cancelQuery} className="rounded-tr-none rounded-br-none border-r-0">
                  <Square size={14} className="mr-1" fill="currentColor" />
                  <span className="mr-2">Cancel</span>
                </Button>
              ) : (
                <Button
                  disabled={!hasQuery}
                  onClick={executeQuery}
                  className="rounded-tr-none rounded-br-none border-r-0"
                >
                  <PlayIcon size={14} className="mr-1" />
                  <span className="mr-2">Run</span>
                  <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
                </Button>
              )}
              <ExportSqlDialog results={results} sqlQuery={template?.query || ""}>
                <Button disabled={!hasQuery} variant="secondary" className="rounded-tl-none rounded-bl-none">
                  <Database className="size-3.5 mr-2" />
                  Export
                  <ChevronDown className="size-3.5 ml-2" />
                </Button>
              </ExportSqlDialog>
            </div>
          </div>
          <TabsContent asChild value="table">
            <div className="flex overflow-hidden h-full">
              {renderContent({
                success: (
                  <DataTableStateProvider>
                    <InfiniteDataTable
                      className="w-full"
                      columns={columns}
                      data={results || []}
                      hasMore={false}
                      isFetching={false}
                      isLoading={false}
                      fetchNextPage={() => {}}
                    />
                  </DataTableStateProvider>
                ),
                loadingText: "Executing query...",
                default: (
                  <div className="flex flex-col w-full items-center justify-center h-full text-muted-foreground space-y-3">
                    <TableProperties className="w-8 h-8 opacity-50" />
                    <p className="text">Execute a query to see table results</p>
                  </div>
                ),
              })}
            </div>
          </TabsContent>

          <TabsContent asChild value="json">
            <div className="flex flex-col flex-1 overflow-hidden">
              {renderContent({
                success: (
                  <ContentRenderer
                    readOnly
                    className="rounded"
                    value={JSON.stringify(results, null, 2)}
                    defaultMode="json"
                  />
                ),
                loadingText: "Processing results...",
                default: (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
                    <FileJson2 className="w-8 h-8 opacity-50" />
                    <p className="text">Execute a query to see JSON results</p>
                  </div>
                ),
              })}
            </div>
          </TabsContent>

          <TabsContent asChild value="chart">
            <div className="flex flex-col flex-1 overflow-hidden">
              {renderContent({
                success: <ChartBuilder query={template?.query || ""} data={results || []} storageKey={template?.id} />,
                loadingText: "Generating chart...",
                default: (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
                    <ChartArea className="w-8 h-8 opacity-50" />
                    <p className="text">Execute a query to visualize results as charts</p>
                  </div>
                ),
              })}
            </div>
          </TabsContent>

          <TabsContent asChild value="parameters">
            <div className="flex flex-col flex-1 overflow-hidden">
              <ParametersPanel parameters={parameters} onChange={onChange} />
            </div>
          </TabsContent>
        </Tabs>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
