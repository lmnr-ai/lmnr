"use client";

import { ChevronRight } from "lucide-react";
import { type ReactNode, useState } from "react";

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

interface ToolRowProps {
  name: string;
  /** Next to the name, e.g. an added/removed icon. */
  badge?: ReactNode;
  /** Right-aligned, e.g. line counts. */
  meta?: ReactNode;
  children: ReactNode;
}

/** A collapsed-by-default row per tool, shared by the tools list and the tools diff. */
export default function ToolRow({ name, badge, meta, children }: ToolRowProps) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <div
          role="button"
          tabIndex={0}
          className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-emphasis-1 transition-colors"
        >
          <ChevronRight
            className={cn("size-3.5 flex-shrink-0 text-muted-foreground transition-transform", open && "rotate-90")}
          />
          <span className="truncate font-mono text-xs">{name}</span>
          {badge}
          <span className="ml-auto flex flex-shrink-0 gap-1.5 font-mono text-xs">{meta}</span>
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent className="px-3 pb-2">{children}</CollapsibleContent>
    </Collapsible>
  );
}
