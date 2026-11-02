import { useCallback } from "react";
import { type ItemCallback } from "react-grid-layout";

import {
  DROP_DASHBOARD_ATTR,
  useDashboardPreviewsStore,
} from "@/components/dashboards/dashboard-previews/previews-store";
import { useMoveChart } from "@/components/dashboards/use-move-chart";

// The dragged chart sits under the pointer, so look through every layer for a preview card.
const dropTargetAt = (event: Event, currentDashboardId: string) => {
  if (!(event instanceof MouseEvent)) return null;
  for (const element of document.elementsFromPoint(event.clientX, event.clientY)) {
    const id = element.closest(`[${DROP_DASHBOARD_ATTR}]`)?.getAttribute(DROP_DASHBOARD_ATTR);
    if (id) return id === currentDashboardId ? null : id;
  }
  return null;
};

/** Grid drag handlers that reveal the dashboard previews and move a chart dropped onto one. */
export const useDragToDashboard = (projectId: string, dashboardId: string) => {
  const { dragChart, endChartDrag } = useDashboardPreviewsStore((s) => ({
    dragChart: s.dragChart,
    endChartDrag: s.endChartDrag,
  }));
  const { moveChart } = useMoveChart(projectId, dashboardId);

  // Not onDragStart: that fires on mousedown, so a plain click on the handle would flash the previews open.
  const onDrag = useCallback<ItemCallback>(
    (_layout, _oldItem, _newItem, _placeholder, event) => dragChart(dropTargetAt(event, dashboardId)),
    [dashboardId, dragChart]
  );

  const onDragStop = useCallback<ItemCallback>(
    (_layout, oldItem, _newItem, _placeholder, event) => {
      const targetId = dropTargetAt(event, dashboardId);
      endChartDrag();
      if (targetId) moveChart(oldItem.i, targetId);
    },
    [dashboardId, endChartDrag, moveChart]
  );

  return { onDrag, onDragStop };
};
