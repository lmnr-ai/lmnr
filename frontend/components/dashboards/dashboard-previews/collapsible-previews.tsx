import { cn } from "@/lib/utils";

import DashboardPreviews, { type DashboardPreviewsProps } from ".";
import { useDashboardPreviewsStore } from "./previews-store";

/** The previews strip, revealed by the header toggle or while a chart is being dragged. */
const CollapsiblePreviews = (props: DashboardPreviewsProps) => {
  const isVisible = useDashboardPreviewsStore((s) => s.isOpen || s.isDraggingChart);

  return (
    // Animating grid rows from 0fr to 1fr grows the height to fit without measuring; the inner
    // wrapper clips, so the contents keep their size and only fade.
    <div
      className={cn(
        "grid shrink-0 transition-[grid-template-rows] duration-200 ease-out",
        isVisible ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
      )}
    >
      <div className="min-h-0 overflow-hidden">
        <div
          inert={!isVisible}
          className={cn("px-4 pt-2 pb-4 transition-opacity duration-200", isVisible ? "opacity-100" : "opacity-0")}
          // Set by the "Dashboard picker" dial.
        >
          <DashboardPreviews {...props} />
        </div>
      </div>
    </div>
  );
};

export default CollapsiblePreviews;
