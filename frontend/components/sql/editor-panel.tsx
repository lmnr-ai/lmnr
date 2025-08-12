"use client";

import { ColumnDef } from "@tanstack/react-table";
import ChartBuilder from "components/chart-builder";
import { isEmpty, isNil, isObject } from "lodash";
import {
  AlertCircle,
  Braces,
  ChartArea,
  ChevronDown,
  Database,
  FileJson2,
  Loader,
  Loader2,
  PlayIcon,
  TableProperties,
} from "lucide-react";
import { useParams } from "next/navigation";
import React, { ReactNode, useCallback, useMemo, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import SQLEditor from "@/components/sql/editor";
import ExportSqlDialog from "@/components/sql/export-sql-dialog";
import ParametersPanel from "@/components/sql/parameters-panel";
import { useSqlEditorStore } from "@/components/sql/sql-editor-store";
import { Button } from "@/components/ui/button";
import CodeHighlighter from "@/components/ui/code-highlighter/index";
import { DataTable } from "@/components/ui/datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";

export default function EditorPanel() {
  const { projectId } = useParams();
  const [results, setResults] = useState<Record<string, any>[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const { template, getFormattedParameters, parameters, onChange } = useSqlEditorStore((state) => ({
    template: state.currentTemplate,
    getFormattedParameters: state.getFormattedParameters,
    parameters: state.parameters,
    onChange: state.setParameterValue,
  }));

  const hasQuery = Boolean(template?.query?.trim());
  const hasResults = results.length > 0;

  const columns = useMemo<ColumnDef<any>[]>(() => {
    if (!isEmpty(results)) {
      return Object.keys(results?.[0]).map((column) => ({
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

    setIsLoading(true);
    setError(null);

    try {
      const parameters = getFormattedParameters();
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, parameters }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || `Query failed with status ${response.status}`);
      }

      setResults(Array.isArray(data) ? data : []);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "An unexpected error occurred while executing the query.";
      setError(errorMessage);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, [projectId, template?.query, toast, getFormattedParameters]);

  useHotkeys("meta+enter,ctrl+enter", executeQuery, {
    enableOnFormTags: ["input", "textarea"],
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
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
            <Loader2 className="w-8 h-8 animate-spin" />
            <p className="text">{loadingText}</p>
          </div>
        );
      }

      if (error) {
        return (
          <div className="flex items-center justify-center h-full space-x-2 text-destructive">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        );
      }

      if (hasResults) {
        return success;
      }

      if (results && results.length === 0) {
        return (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            Query executed successfully but returned no results
          </div>
        );
      }

      return defaultContent;
    },
    [isLoading, error, hasResults, results]
  );

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
              <ChartArea className="mr-2 w-4 h-4" />
              <span>Chart</span>
            </TabsTrigger>
            <TabsTrigger value="parameters">
              <Braces className="mr-2 w-4 h-4" />
              <span>Parameters</span>
            </TabsTrigger>
            <div className="ml-auto py-2">
              <ExportSqlDialog results={results} sqlQuery={template?.query || ""}>
                <Button disabled={!hasQuery} variant="secondary" className="rounded-tr-none rounded-br-none border-r-0">
                  <Database className="size-3.5 mr-2" />
                  Export
                  <ChevronDown className="size-3.5 ml-2" />
                </Button>
              </ExportSqlDialog>
              <Button
                disabled={isLoading || !hasQuery}
                onClick={executeQuery}
                className="ml-auto px-2 rounded-tl-none rounded-bl-none"
              >
                {isLoading ? (
                  <Loader size={14} className="mr-1 animate-spin" />
                ) : (
                  <PlayIcon size={14} className="mr-1" />
                )}
                <span className="mr-2">Run</span>
                <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
              </Button>
            </div>
          </TabsList>

          <TabsContent asChild value="table">
            <div className="size-full">
              {renderContent({
                success: <DataTable className="border-t-0 w-full" columns={columns} data={results || []} paginated />,
                loadingText: "Executing query...",
                default: (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground space-y-3">
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
                  <CodeHighlighter
                    readOnly
                    className="border-0"
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
                success: <ChartBuilder query={template?.query || ""} data={results || []} />,
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
