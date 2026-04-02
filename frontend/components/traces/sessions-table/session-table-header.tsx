export const CHEVRON_COLUMN_WIDTH_CLASSNAME = "w-10";
export const START_TIME_COLUMN_WIDTH_CLASSNAME = "w-[120px]";
export const SESSION_ID_COLUMN_WIDTH_CLASSNAME = "w-[189px]";
export const TOTALS_COLUMN_WIDTH_CLASSNAME = "w-60";

export default function SessionTableHeader() {
  return (
    <div className="bg-secondary border rounded-t-lg flex h-9 items-center shrink-0 sticky top-0 w-full z-10">
      <div className={`shrink-0 ${CHEVRON_COLUMN_WIDTH_CLASSNAME}`} />
      <div className={`flex items-center px-4 py-0.5 shrink-0 ${START_TIME_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-xs text-secondary-foreground">Start time</span>
      </div>
      <div className={`flex items-center px-4 py-0.5 shrink-0 ${SESSION_ID_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-xs text-secondary-foreground">ID</span>
      </div>
      <div className={`flex items-center px-4 py-0.5 shrink-0 ${TOTALS_COLUMN_WIDTH_CLASSNAME}`}>
        <span className="text-xs text-secondary-foreground">Totals</span>
      </div>
      <div className="flex flex-1 items-center min-w-0 px-4 py-0.5">
        <span className="text-xs text-secondary-foreground">Traces</span>
      </div>
    </div>
  );
}
