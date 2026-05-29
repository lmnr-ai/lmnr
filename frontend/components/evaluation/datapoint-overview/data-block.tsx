import { ChevronRight } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

interface DataBlockProps {
  label: string;
  value: unknown;
  defaultOpen?: boolean;
}

function tryFormat(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") {
    // attempt JSON pretty-print so api-returned strings render nicely
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

export default function DataBlock({ label, value, defaultOpen = false }: DataBlockProps) {
  const [open, setOpen] = useState(defaultOpen);
  const text = tryFormat(value);
  const isEmpty = !text || text === "null" || text === "{}" || text === '""';

  return (
    <div className="rounded-[4px] border border-border bg-secondary overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs hover:bg-muted/30 transition-colors"
      >
        <ChevronRight className={cn("size-3 transition-transform shrink-0", open && "rotate-90")} />
        <span className="text-muted-foreground">{label}</span>
        {isEmpty && <span className="text-muted-foreground/60 italic">empty</span>}
      </button>
      {open && !isEmpty && (
        <div className="border-t border-border max-h-[200px] overflow-auto">
          <pre className="text-xs font-mono whitespace-pre-wrap break-all px-3 py-2 text-foreground">{text}</pre>
        </div>
      )}
    </div>
  );
}
