import { sortBy } from "lodash";
import { type z } from "zod/v4";

import { type ChartUpdatesSchema } from "@/lib/actions/dashboard/index";

export const repositionCharts = (charts: z.infer<typeof ChartUpdatesSchema>) =>
  sortBy(charts, ["settings.layout.y", "settings.layout.x"]).reduce(
    (acc, chart) => {
      const { currentX, currentY, charts } = acc;
      const chartWidth = chart.settings.layout.w;
      const chartHeight = chart.settings.layout.h;
      const nextX = currentX + chartWidth > 12 ? 0 : currentX;
      const nextY = currentX + chartWidth > 12 ? currentY + chartHeight : currentY;

      return {
        currentX: nextX + chartWidth,
        currentY: nextY,
        charts: [
          ...charts,
          {
            ...chart,
            settings: {
              ...chart.settings,
              layout: { ...chart.settings.layout, x: nextX, y: nextY },
            },
          },
        ],
      };
    },
    { currentX: 4, currentY: 0, charts: [] as z.infer<typeof ChartUpdatesSchema> }
  ).charts;
