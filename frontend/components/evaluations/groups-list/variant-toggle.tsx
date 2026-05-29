import { AlignJustify, AlignLeft, Hash, MousePointer2, Rows3 } from "lucide-react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { GroupVariant } from "./types";

const OPTIONS: { value: GroupVariant; label: string; Icon: React.ComponentType<{ className?: string }> }[] = [
  { value: "list", label: "List", Icon: AlignLeft },
  { value: "stacked", label: "Stacked metadata", Icon: Rows3 },
  { value: "inline", label: "Inline", Icon: AlignJustify },
  { value: "leading-count", label: "Leading count", Icon: Hash },
  { value: "hover-dense", label: "Hover dense", Icon: MousePointer2 },
];

type Props = {
  value: GroupVariant;
  onChange: (v: GroupVariant) => void;
};

export default function VariantToggle({ value, onChange }: Props) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="inline-flex items-center gap-0.5 rounded-md border bg-muted/40 p-0.5">
        {OPTIONS.map(({ value: v, label, Icon }) => (
          <Tooltip key={v}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                aria-pressed={value === v}
                onClick={() => onChange(v)}
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-sm transition-colors",
                  value === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Icon className="size-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="border text-xs">
              {label}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </TooltipProvider>
  );
}
