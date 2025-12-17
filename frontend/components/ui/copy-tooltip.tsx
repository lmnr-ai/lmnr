"use client";

import { PropsWithChildren, useCallback, useEffect, useRef, useState } from "react";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CopyTooltipProps {
  value: string;
  text?: string;
  copiedText?: string;
  className?: string;
}

export default function CopyTooltip({
  value,
  text = "Click to copy",
  copiedText = "Copied!",
  children,
  className,
}: PropsWithChildren<CopyTooltipProps>) {
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);

      setCopied(true);
      setOpen(true);

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        setOpen(false);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  }, [value]);

  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (newOpen) {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      setCopied(false);
    }
    setOpen(newOpen);
  }, []);

  useEffect(
    () => () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    },
    []
  );

  return (
    <TooltipProvider delayDuration={0}>
      <Tooltip open={open} onOpenChange={handleOpenChange}>
        <TooltipTrigger asChild>
          <span onClick={handleCopy} className={cn("cursor-pointer", className)}>
            {children}
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>{copied ? copiedText : text}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
