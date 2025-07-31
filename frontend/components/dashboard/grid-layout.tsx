import "react-grid-layout/css/styles.css";
import "./styles.css";

import { compact, debounce, isEqual, pick } from "lodash";
import { Loader } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useMemo } from "react";
import { Responsive, ResponsiveProps, WidthProvider } from "react-grid-layout";
import useSWR from "swr";

import Chart from "@/components/dashboard/chart";
import { DashboardChart } from "@/components/dashboard/types";
import { swrFetcher } from "@/lib/utils";

const ResponsiveGridLayout = WidthProvider(Responsive);

const updateLayout = (updates: any, projectId: string) => {
  fetch(`/api/projects/${projectId}/dashboard-charts`, {
    method: "PATCH",
    body: JSON.stringify({ updates }),
  });
};

const GridLayout = () => {
  const { projectId } = useParams();
  const {
    data = [],
    isLoading,
    mutate,
  } = useSWR<DashboardChart[]>(`/api/projects/${projectId}/dashboard-charts`, swrFetcher);

  const layout = (data || []).map((chart) => ({
    i: chart.id,
    ...chart.settings.layout,
  }));

  const children = useMemo(
    () =>
      (data || []).map((chart) => (
        <div key={chart.id} className="rounded-lg">
          <Chart chart={chart} />
        </div>
      )),
    [data]
  );

  const onLayoutChange = useCallback<NonNullable<ResponsiveProps["onLayoutChange"]>>(
    async (currentLayout) => {
      const optimisticData = (data || []).map((item) => ({
        ...item,
        settings: {
          ...item.settings,
          layout: pick(
            currentLayout?.find((l) => item.id === l.i),
            ["x", "y", "w", "h"]
          ),
        },
      })) as DashboardChart[];

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
            async () => {
              updateLayout(updates, projectId as string);
              return optimisticData;
            },
            {
              revalidate: false,
              populateCache: true,
              rollbackOnError: true,
              optimisticData,
            }
          );
        } catch (error) {
          console.error(error);
        }
      }
    },
    [data, mutate, projectId]
  );

  const debouncedAutoSave = useMemo(() => debounce(onLayoutChange, 500), [onLayoutChange]);

  if (isLoading) {
    return (
      <div className="flex flex-1 h-full justify-center items-center">
        <Loader className="animate-spin h-8 w-8 text-secondary-foreground" />
      </div>
    );
  }
  return (
    <ResponsiveGridLayout
      className="layout"
      useCSSTransforms
      onLayoutChange={debouncedAutoSave}
      layouts={{ lg: layout, md: layout }}
      breakpoints={{ lg: 1200, md: 996 }}
      cols={{ lg: 12, md: 12 }}
      rowHeight={72}
      isDraggable={true}
      isResizable={true}
      margin={[16, 16]}
      draggableHandle=".drag-handle"
      containerPadding={[0, 0]}
    >
      {children}
    </ResponsiveGridLayout>
  );
};

export default GridLayout;
