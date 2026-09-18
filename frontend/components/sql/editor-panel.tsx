"use client";

import ChartBuilder from "components/chart-builder";
import { AlertCircle, Braces, ChartArea, FileJson2, Loader2, TableProperties } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useCallback, useRef, useState } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import ParametersPanel from "@/components/sql/parameters-panel";
import QueryActions from "@/components/sql/query-actions";
import ResultsTable from "@/components/sql/results-table";
import { useSqlEditorStore } from "@/components/sql/sql-editor-store";
import TemplateEditor from "@/components/sql/template-editor";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { ElevatedSurface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/lib/hooks/use-toast";
import { track } from "@/lib/posthog";

export default function EditorPanel() {
  const { projectId } = useParams();
  const [results, setResults] = useState<Record<string, any>[] | null>(null);
  // Template that PRODUCED the current results. `results` survives a template
  // switch (no remount on /sql/[id] nav), so keying storage off the selected
  // template would save the old result shape's widths under the new template.
  const [resultsTemplateId, setResultsTemplateId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const { template, getFormattedParameters, parameters, onChange, flushQuerySave } = useSqlEditorStore((state) => ({
    template: state.currentTemplate,
    getFormattedParameters: state.getFormattedParameters,
    parameters: state.parameters,
    onChange: state.setParameterValue,
    flushQuerySave: state.flushQuerySave,
  }));

  const hasResults = results !== null && results.length > 0;

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

    // Running is an explicit checkpoint — persist whatever the debounce is still holding.
    void flushQuerySave();

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
      setResultsTemplateId(template?.id ?? null);
      track("sql_editor", "query_executed");
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
  }, [projectId, template?.query, template?.id, toast, getFormattedParameters, flushQuerySave]);

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
          <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            <p className="text-sm">{loadingText}</p>
          </div>
        );
      }

      if (error) {
        return (
          <div className="flex flex-1 items-start justify-center gap-2 overflow-auto p-4 text-destructive">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <div className="whitespace-pre-wrap text-sm">{error}</div>
          </div>
        );
      }

      if (hasResults) {
        return success;
      }

      if (results !== null && results.length === 0) {
        return (
          <div className="flex w-full flex-1 items-center justify-center text-sm text-muted-foreground">
            Query executed successfully but returned no results
          </div>
        );
      }

      return defaultContent;
    },
    [isLoading, error, hasResults, results]
  );

  const emptyState = (icon: ReactNode, text: string) => (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 text-muted-foreground">
      {icon}
      <p className="text-sm">{text}</p>
    </div>
  );

  return (
    <ResizablePanelGroup id="sql-editor-panels" orientation="vertical">
      <ResizablePanel className="flex min-h-0 flex-col" defaultSize={40} minSize={20}>
        <TemplateEditor
          actions={
            <QueryActions
              query={template?.query || ""}
              templateId={template?.id}
              results={results}
              isLoading={isLoading}
              onRun={executeQuery}
              onCancel={cancelQuery}
            />
          }
        />
      </ResizablePanel>
      <ResizableHandle className="z-30 my-1.5 bg-transparent transition-colors duration-200" withHandle />
      <ResizablePanel className="flex min-h-0 flex-col" defaultSize={60} minSize={20}>
        <ElevatedSurface className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border">
          <Tabs className="flex h-full min-h-0 flex-col gap-0" defaultValue="table">
            <div className="flex h-10 shrink-0 items-center gap-3 border-b px-2">
              <TabsList size="sm" className="bg-surface-up-2">
                <TabsTrigger value="table">
                  <TableProperties className="size-3.5" />
                  <span>Table</span>
                </TabsTrigger>
                <TabsTrigger value="json">
                  <FileJson2 className="size-3.5" />
                  <span>JSON</span>
                </TabsTrigger>
                <TabsTrigger value="chart">
                  <ChartArea className="size-3.5" />
                  <span>Chart</span>
                </TabsTrigger>
                <TabsTrigger value="parameters">
                  <Braces className="size-3.5" />
                  <span>Parameters</span>
                </TabsTrigger>
              </TabsList>
              {results !== null && !isLoading && !error && (
                <span className="whitespace-nowrap text-xs text-muted-foreground">
                  {results.length} {results.length === 1 ? "row" : "rows"}
                </span>
              )}
            </div>

            <TabsContent asChild value="table">
              <div className="flex min-h-0 flex-1 overflow-hidden">
                {renderContent({
                  success: (
                    <ResultsTable
                      results={results || []}
                      storageKey={`sql-results-column-sizing-${projectId}-${resultsTemplateId ?? "draft"}`}
                    />
                  ),
                  default: emptyState(
                    <TableProperties className="size-5 opacity-60" />,
                    "Run the query to see table results"
                  ),
                })}
              </div>
            </TabsContent>

            <TabsContent asChild value="json">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                {renderContent({
                  success: <ContentRenderer readOnly value={JSON.stringify(results, null, 2)} defaultMode="json" />,
                  loadingText: "Processing results...",
                  default: emptyState(<FileJson2 className="size-5 opacity-60" />, "Run the query to see raw JSON"),
                })}
              </div>
            </TabsContent>

            <TabsContent asChild value="chart">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden p-2">
                {renderContent({
                  success: (
                    <ChartBuilder
                      query={template?.query || ""}
                      data={results || []}
                      storageKey={resultsTemplateId ?? undefined}
                    />
                  ),
                  loadingText: "Generating chart...",
                  default: emptyState(<ChartArea className="size-5 opacity-60" />, "Run the query to build a chart"),
                })}
              </div>
            </TabsContent>

            <TabsContent asChild value="parameters">
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <ParametersPanel parameters={parameters} onChange={onChange} />
              </div>
            </TabsContent>
          </Tabs>
        </ElevatedSurface>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
