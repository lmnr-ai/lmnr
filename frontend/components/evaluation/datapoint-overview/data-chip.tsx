import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface DataChipProps {
  label: string;
  value: unknown;
}

function tryFormat(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export default function DataChip({ label, value }: DataChipProps) {
  const text = tryFormat(value);
  const isEmpty = !text || text === "null" || text === "{}" || text === '""';

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex items-center gap-1 h-6 px-2 rounded-[3px] text-xs",
            "border border-border bg-background hover:bg-muted/40 transition-colors",
            isEmpty && "opacity-50"
          )}
        >
          <span className="text-muted-foreground">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] max-w-[90vw] p-0 max-h-[60vh] overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <span className="text-xs text-muted-foreground">{label}</span>
        </div>
        {isEmpty ? (
          <div className="px-3 py-4 text-xs text-muted-foreground italic">empty</div>
        ) : (
          <div className="max-h-[50vh] overflow-auto">
            <pre className="text-xs font-mono whitespace-pre-wrap break-all px-3 py-2 text-foreground">{text}</pre>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
