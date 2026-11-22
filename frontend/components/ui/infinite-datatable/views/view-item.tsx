"use client";

import { Bookmark, Check, Pencil, Trash2 } from "lucide-react";

import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";

interface ViewItemProps {
  label: string;
  active: boolean;
  isDefault: boolean;
  onPick: () => void;
  // Omitted when the action doesn't apply (the current default; rename/delete on the built-in view).
  onSetDefault?: () => void;
  onRename?: () => void;
  onDelete?: () => void;
}

const ACTION_BUTTON_CLASS =
  "inline-flex size-5 items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100";

function RowAction({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onClick();
          }}
          className={ACTION_BUTTON_CLASS}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipPortal>
        <TooltipContent side="top">{label}</TooltipContent>
      </TooltipPortal>
    </Tooltip>
  );
}

export default function ViewItem({
  label,
  active,
  isDefault,
  onPick,
  onSetDefault,
  onRename,
  onDelete,
}: ViewItemProps) {
  return (
    <DropdownMenuItem onSelect={onPick} className="group text-xs">
      <span className="flex min-w-0 flex-1 items-center gap-1">
        <span className="truncate">{label}</span>
        {isDefault && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Bookmark
                aria-label="Project default view"
                className="size-3 shrink-0 fill-current text-muted-foreground"
              />
            </TooltipTrigger>
            <TooltipPortal>
              <TooltipContent side="top" className="max-w-56">
                Project default view: teammates who haven&apos;t picked a view open this one
              </TooltipContent>
            </TooltipPortal>
          </Tooltip>
        )}
      </span>
      <span className="inline-flex h-5 shrink-0 items-center gap-1">
        {onSetDefault && (
          <RowAction label="Set as project default view" onClick={onSetDefault}>
            <Bookmark className="size-3.5 shrink-0" />
          </RowAction>
        )}
        {onRename && (
          <RowAction label="Rename" onClick={onRename}>
            <Pencil className="size-3.5 shrink-0" />
          </RowAction>
        )}
        {onDelete && (
          <RowAction label="Delete" onClick={onDelete}>
            <Trash2 className="size-3.5 shrink-0" />
          </RowAction>
        )}
      </span>
      {active && <Check className="size-3.5 shrink-0" />}
    </DropdownMenuItem>
  );
}
