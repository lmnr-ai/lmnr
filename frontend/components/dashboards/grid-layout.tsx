import "react-grid-layout/css/styles.css";
import "./styles.css";
import { compact, debounce, isEqual, pick } from "lodash";
import { useParams } from "next/navigation";
import React, { memo, useCallback, useEffect, useMemo } from "react";
import { Responsive, type ResponsiveProps, WidthProvider } from "react-grid-layout";
import useSWR from "swr";

import Chart from "@/components/dashboards/chart";
import { type DashboardChart, dragHandleKey, getChartsUrl, GRID_COLS } from "@/components/dashboards/types";
import { useDragToDashboard } from "@/components/dashboards/use-drag-to-dashboard";
import { IconResizeHandle } from "@/components/ui/icons";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { swrFetcher } from "@/lib/utils";

const ResponsiveGridLayout = WidthProvider(Responsive);

const updateLayout = (updates: any, chartsUrl: string) => {
  fetch(chartsUrl, {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
};

const GridLayout = () => {
  const { projectId, dashboardId } = useParams<{ projectId: string; dashboardId: string }>();
  const chartsUrl = getChartsUrl(projectId, dashboardId);
  const { data = [], isLoading, mutate, error } = useSWR<DashboardChart[]>(chartsUrl, swrFetcher);
  const { onDrag, onDragStop } = useDragToDashboard(projectId, dashboardId);

  const { toast } = useToast();

  useEffect(() => {
    if (error) {
      toast({ variant: "destructive", title: "Error", description: error.message });
    }
  }, [error, toast]);

  const layout = (data || []).map((chart) => ({
    i: chart.id,
    ...chart.settings.layout,
  }));

  const children = useMemo(
    () =>
      (data || []).map((chart) => (
        <div key={chart.id} className="rounded-md bg-surface-up">
          <Chart chart={chart} />
        </div>
      )),
    [data]
  );

  const onLayoutChange = useCallback<NonNullable<ResponsiveProps["onLayoutChange"]>>(
    async (currentLayout) => {
      // Built from the latest cache, not `data`: a chart dropped on another dashboard is gone by the
      // time this debounced save runs, and must not be put back. A chart added after this snapshot keeps
      // its own position.
      const withLayout = (current?: DashboardChart[]) =>
        (current || []).map((item) => {
          const itemLayout = currentLayout?.find((l) => item.id === l.i);
          if (!itemLayout) return item;
          return {
            ...item,
            settings: {
              ...item.settings,
              layout: pick(itemLayout, ["x", "y", "w", "h"]),
            },
          };
        }) as DashboardChart[];

      const updates = compact(
        data.map((chart) => {
          const current = currentLayout.find((item) => item.i === chart.id);
          if (!current) return null;

          const targetLayout = { x: current.x, y: current.y, w: current.w, h: current.h };

          if (!isEqual(chart.settings.layout, targetLayout)) {
            return {
              id: chart.id,
              settings: {
                ...chart.settings,
                layout: targetLayout,
              },
            };
          }

          return null;
        })
      );

      if (updates.length > 0) {
        try {
          await mutate(
            async (current?: DashboardChart[]) => {
              updateLayout(updates, chartsUrl);
              return withLayout(current);
            },
            {
              revalidate: false,
              populateCache: true,
              rollbackOnError: true,
              optimisticData: withLayout,
            }
          );
        } catch (error) {
          console.error(error);
        }
      }
    },
    [chartsUrl, data, mutate]
  );

  const debouncedAutoSave = useMemo(() => debounce(onLayoutChange, 500), [onLayoutChange]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-3 gap-4">
        {Array.from({ length: 9 }).map((_, item) => (
          <Skeleton key={item} className="h-[296px] w-full bg-emphasis-1" />
        ))}
      </div>
    );
  }
  if (data.length === 0) {
    return (
      // Absolute against the ScrollArea root: the viewport's content wrapper can't stretch to full height.
      <div className="absolute inset-0 flex items-center justify-center text-sm text-muted-foreground">
        This dashboard has no charts yet.
      </div>
    );
  }

  return (
    <ResponsiveGridLayout
      className="layout"
      useCSSTransforms={false}
      onLayoutChange={debouncedAutoSave}
      onDrag={onDrag}
      onDragStop={onDragStop}
      layouts={{ lg: layout, md: layout }}
      breakpoints={{ lg: 1200, md: 996 }}
      cols={{ lg: GRID_COLS, md: GRID_COLS }}
      rowHeight={36}
      isDraggable={true}
      isResizable={true}
      margin={[12, 12]}
      draggableHandle={`.${dragHandleKey}`}
      containerPadding={[0, 0]}
      resizeHandle={
        <span className="absolute right-2 bottom-2 cursor-se-resize text-foreground-300">
          <IconResizeHandle className="size-4" />
        </span>
      }
    >
      {children}
    </ResponsiveGridLayout>
  );
};

export default memo(GridLayout);
