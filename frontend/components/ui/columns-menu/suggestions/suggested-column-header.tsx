"use client";

import { Check, Sparkles, X } from "lucide-react";

import { cn } from "@/lib/utils";

interface SuggestedColumnHeaderProps {
  name: string;
  onKeep: () => void;
  onDiscard: () => void;
}

/**
 * Header for a not-yet-accepted suggested column. Shows the name with a
 * sparkles marker and a hover-revealed keep (✓) / discard (✕) control pair.
 * Relies on the `group` class on the enclosing table head cell for hover.
 */
export function SuggestedColumnHeader({ name, onKeep, onDiscard }: SuggestedColumnHeaderProps) {
  const stop = (e: React.SyntheticEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="flex items-center gap-1 min-w-0">
      <Sparkles className="size-3 shrink-0 text-primary-400" />
      <span className="truncate">{name}</span>
      <div
        className="ml-1 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
        onPointerDown={stop}
        onClick={stop}
      >
        <IconButton title="Keep column" onClick={onKeep} className="hover:text-success">
          <Check className="size-3" />
        </IconButton>
        <IconButton title="Discard suggestion" onClick={onDiscard} className="hover:text-destructive">
          <X className="size-3" />
        </IconButton>
      </div>
    </div>
  );
}

function IconButton({
  title,
  onClick,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      className={cn(
        "flex items-center justify-center rounded p-0.5 text-muted-foreground hover:bg-muted transition-colors",
        className
      )}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}
