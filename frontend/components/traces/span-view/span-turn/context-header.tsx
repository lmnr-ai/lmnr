import { ChevronDown } from "lucide-react";
import { memo } from "react";

import { CopyButton } from "@/components/ui/copy-button";
import { cn } from "@/lib/utils";

interface ContextHeaderProps {
  summary: string;
  open: boolean;
  onToggle: () => void;
  /** Full input payload. */
  copyText: string;
}

/** Focused layout: everything sent before this call's new input, folded behind one header. */
const ContextHeader = ({ summary, open, onToggle, copyText }: ContextHeaderProps) => (
  <div className={cn("flex items-center gap-2 px-1", open ? "pb-2" : "pb-4")}>
    {/* Trailing chevron keeps "Context" aligned with the Input / Output headings; the divider is part of the target. */}
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="group flex flex-1 items-center gap-2 min-w-0 text-left"
    >
      <span className="text-base font-medium text-secondary-foreground group-hover:text-foreground">Context</span>
      <span className="-ml-1 min-w-0 truncate text-sm text-muted-foreground">· {summary}</span>
      <ChevronDown
        className={cn(
          "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:text-foreground",
          !open && "-rotate-90"
        )}
      />
      <div className="flex-1 border-t" />
    </button>
    <CopyButton text={copyText} size="icon" variant="ghost" iconClassName="size-3.5" className="text-foreground/80" />
  </div>
);

export default memo(ContextHeader);
