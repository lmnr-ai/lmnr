export function LeftEdgeResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  // Keep the visible line 1px (no layout shift) but give it a wide, invisible grab
  // zone straddling the edge so the panel is easy to resize. z-10 lifts the grab zone
  // above adjacent panel content so the mousedown always lands on the handle.
  return (
    <div className="relative w-px flex-shrink-0 cursor-col-resize group" onMouseDown={onMouseDown}>
      <div className="absolute inset-y-0 left-0 w-px bg-border transition-colors group-hover:w-0.5 group-hover:bg-blue-400" />
      <div className="absolute inset-y-0 -left-1.5 z-10 w-3.5" />
    </div>
  );
}
