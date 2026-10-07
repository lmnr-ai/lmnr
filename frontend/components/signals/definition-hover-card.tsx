"use client";

import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { type ReactNode } from "react";

import { ElevatedSurface } from "@/components/ui/surface";
import { cn } from "@/lib/utils";

interface DefinitionHoverCardProps {
  children: ReactNode;
  definition: string;
  textClassName: string;
}

export default function DefinitionHoverCard({ children, definition, textClassName }: DefinitionHoverCardProps) {
  return (
    <TooltipPrimitive.Root delayDuration={300} disableHoverableContent>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content asChild align="start" alignOffset={-8} side="bottom" sideOffset={0}>
          <ElevatedSurface
            offset={3}
            className={cn(
              "pointer-events-none z-50 max-h-[min(60vh,420px)] w-[calc(var(--radix-tooltip-trigger-width)+16px)] -translate-y-[calc(var(--radix-tooltip-trigger-height)+8px)] overflow-hidden whitespace-pre-wrap rounded-md border p-2 text-muted-foreground shadow-md shadow-background/80 outline-hidden data-[state=delayed-open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=delayed-open]:fade-in-0",
              textClassName
            )}
          >
            {definition}
          </ElevatedSurface>
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
