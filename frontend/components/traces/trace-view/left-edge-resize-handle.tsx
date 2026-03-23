export function LeftEdgeResizeHandle({ onMouseDown }: { onMouseDown: (e: React.MouseEvent) => void }) {
  return (
    <div className="w-0.5 cursor-col-resize group flex-shrink-0 relative" onMouseDown={onMouseDown}>
      <div className="absolute inset-y-0 left-0 w-px bg-border group-hover:w-0.5 group-hover:bg-blue-400 transition-colors" />
    </div>
  );
}
