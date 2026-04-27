"use client";

import { type ReactNode } from "react";

import { cn } from "@/lib/utils";

interface SignalTabCardProps {
  title: string;
  description: string;
  isActive?: boolean;
  onClick?: () => void;
  children?: ReactNode;
}

export default function SignalTabCard({ title, description, isActive, onClick, children }: SignalTabCardProps) {
  const interactive = typeof onClick === "function";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!interactive}
      className={cn(
        "flex-1 min-w-0 flex flex-col items-start gap-1 px-4 py-3 rounded-lg border bg-secondary text-left hover:bg-muted/60",
        interactive ? "cursor-pointer" : "cursor-default",
        isActive ? "border-muted-foreground/40 bg-muted hover:bg-muted/80" : "border-border"
      )}
    >
      <span className="text-xs leading-[14px] text-secondary-foreground truncate w-full justify-between flex">
        {title}
        {children}
      </span>
      <span className="text-xs leading-[14px] text-muted-foreground truncate w-full">{description}</span>
    </button>
  );
}
