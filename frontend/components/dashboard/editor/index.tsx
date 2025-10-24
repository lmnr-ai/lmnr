"use client";

import CodeMirror from "@uiw/react-codemirror";
import { isEmpty } from "lodash";
import { AlertCircle, Braces, ChartArea, Loader, Loader2, PlayIcon, TableProperties } from "lucide-react";
import { useParams } from "next/navigation";
import React, { ReactNode, useCallback } from "react";
import { useHotkeys } from "react-hotkeys-hook";

import ChartBuilder from "@/components/chart-builder";
import {
  DashboardEditorProps,
  DashboardEditorStoreProvider,
  useDashboardEditorStoreContext,
} from "@/components/dashboard/editor/dashboard-editor-store";
import ParametersPanel from "@/components/sql/parameters-panel";
import { extensions, theme } from "@/components/sql/utils";
import { Button } from "@/components/ui/button";
import Header from "@/components/ui/header";
import { InfiniteDataTable } from "@/components/ui/infinite-datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const DashboardEditorCore = () => {
  const { projectId, id } = useParams();

  const { query, columns, tab, setTab, onChange, executeQuery, isLoading, error, data, onParameterChange, parameters } =
    useDashboardEditorStoreContext((state) => ({
      columns: state.columns,
      query: state.chart.query,
      tab: state.tab,
      setTab: state.setTab,
      onChange: state.setQuery,
      executeQuery: state.executeQuery,
      isLoading: state.isLoading,
      error: state.error,
      data: state.data,
      parameters: state.parameters,
      onParameterChange: state.setParameterValue,
    }));

  const handleExecuteQuery = useCallback(() => executeQuery(projectId as string), [executeQuery, projectId]);

  useHotkeys("meta+enter,ctrl+enter", handleExecuteQuery, {
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
          <div className="flex flex-1 flex-col items-center justify-center h-full text-muted-foreground space-y-3">
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

      if (!isEmpty(data)) {
        return success;
      }

      if (data.length === 0) {
        return <div className="flex flex-1 items-center justify-center h-full text-muted-foreground">No results</div>;
      }

      return defaultContent;
    },
    [isLoading, error, data]
  );

  return (
    <>
      <Header path={`dashboard/${id}`} />
      <ResizablePanelGroup className="px-4 pb-4" direction="vertical">
        <ResizablePanel className="flex flex-1" defaultSize={40} minSize={20}>
          <div className="flex border rounded bg-secondary overflow-auto w-full h-full">
            <CodeMirror
              placeholder="Enter your SQL query..."
              theme={theme}
              className="size-full"
              extensions={extensions}
              editable
              autoFocus
              value={query}
              onChange={onChange}
            />
          </div>
        </ResizablePanel>
        <ResizableHandle className="z-30 bg-transparent transition-colors duration-200" withHandle />
        <ResizablePanel className="flex flex-col h-full mt-2" defaultSize={60} minSize={20}>
          <Tabs
            value={tab}
            className="flex flex-col h-full overflow-hidden"
            onValueChange={(v) => setTab(v as typeof tab)}
          >
            <div className="flex items-center h-fit">
              <TabsList className="text-xs">
                <TabsTrigger value="table">
                  <TableProperties className="size-4" />
                  <span>Table</span>
                </TabsTrigger>
                <TabsTrigger value="chart">
                  <ChartArea className="size-4" />
                  <span>Chart</span>
                </TabsTrigger>
                <TabsTrigger className="relative" value="parameters">
                  <Braces className="size-4" />
                  <span>Parameters</span>
                </TabsTrigger>
              </TabsList>
              <div className="ml-auto">
                <Button disabled={isLoading || !query.trim()} onClick={handleExecuteQuery} className="ml-auto">
                  {isLoading ? (
                    <Loader size={14} className="mr-1 animate-spin" />
                  ) : (
                    <PlayIcon size={14} className="mr-1" />
                  )}
                  <span className="mr-2">Run</span>
                  <div className="text-center text-xs opacity-75">⌘ + ⏎</div>
                </Button>
              </div>
            </div>
            <TabsContent asChild value="table">
              <div className="flex overflow-hidden h-full">
                {renderContent({
                  success: (
                    <InfiniteDataTable
                      className="w-full"
                      columns={columns}
                      data={data}
                      hasMore={false}
                      isFetching={false}
                      isLoading={false}
                      fetchNextPage={() => { }}
                    />
                  ),
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
            <TabsContent asChild value="chart">
              <div className="flex flex-col flex-1 overflow-hidden">
                {renderContent({
                  success: <ChartBuilder data={data} query={query} />,
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
            <TabsContent value="parameters">
              <ParametersPanel parameters={parameters} onChange={onParameterChange} />
            </TabsContent>
          </Tabs>
        </ResizablePanel>
      </ResizablePanelGroup>
    </>
  );
};

const DashboardEditor = ({ chart }: DashboardEditorProps) => (
  <DashboardEditorStoreProvider chart={chart}>
    <DashboardEditorCore />
  </DashboardEditorStoreProvider>
);

export default DashboardEditor;
