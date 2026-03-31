export default function SessionTableHeader() {
  return (
    <div className="bg-secondary border-b flex h-9 items-center shrink-0 sticky top-0 w-full z-10">
      <div className="shrink-0 w-10" />
      <div className="flex items-center px-4 py-0.5 shrink-0 w-[120px]">
        <span className="text-xs text-secondary-foreground">Start time</span>
      </div>
      <div className="flex items-center px-4 py-0.5 shrink-0 w-[189px]">
        <span className="text-xs text-secondary-foreground">ID</span>
      </div>
      <div className="flex items-center px-4 py-0.5 shrink-0 w-60">
        <span className="text-xs text-secondary-foreground">Totals</span>
      </div>
      <div className="flex flex-1 items-center min-w-0 px-4 py-0.5">
        <span className="text-xs text-secondary-foreground">Traces</span>
      </div>
    </div>
  );
}
