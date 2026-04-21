export default function TraceSectionHeader() {
  return (
    <div className="flex items-start w-full pl-6 pt-4 pb-1">
      <div className="shrink-0 w-40">
        <span className="text-sm text-muted-foreground">Details</span>
      </div>
      <div className="flex-1 min-w-0 overflow-clip">
        <span className="text-sm text-muted-foreground">Input</span>
      </div>
      <div className="flex-1 min-w-0 overflow-clip">
        <span className="text-sm text-muted-foreground">Output</span>
      </div>
    </div>
  );
}
