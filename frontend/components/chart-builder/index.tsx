import React from "react";

import { type ChartBuilderProps, ChartBuilderStoreProvider } from "@/components/chart-builder/chart-builder-store";
import ChartControls from "@/components/chart-builder/chart-controls";
import ChartRenderer from "@/components/chart-builder/charts";
import { ScrollArea } from "@/components/ui/scroll-area";

const ChartBuilder = ({ data, query, storageKey }: ChartBuilderProps) => (
  // Keyed on the storage key: `persist` captures its key when the store is created, so a store
  // reused across saved queries would read one query's chart config and write it under another's.
  <ChartBuilderStoreProvider key={storageKey} data={data} query={query} storageKey={storageKey}>
    <div className="flex h-full min-h-0 overflow-hidden">
      <ChartControls />
      <ScrollArea className="flex min-w-0 flex-1 [&>*>div]:h-full">
        <div className="size-full p-3">
          <ChartRenderer />
        </div>
      </ScrollArea>
    </div>
  </ChartBuilderStoreProvider>
);

export default ChartBuilder;
