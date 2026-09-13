"use client";

import { type ComponentProps, forwardRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface HeaderIconButtonProps extends Omit<ComponentProps<typeof Button>, "icon"> {
  icon: ReactNode;
  label: string;
  active?: boolean;
}

export const HeaderIconButton = forwardRef<HTMLButtonElement, HeaderIconButtonProps>(
  ({ icon, label, active = false, className, ...props }, ref) => (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <Button
          ref={ref}
          variant="ghost"
          size="icon"
          aria-label={label}
          className={cn("hover:bg-surface-up-3", active && "bg-surface-up-2 text-primary", className)}
          {...props}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="bottom">{label}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  )
);

HeaderIconButton.displayName = "HeaderIconButton";
