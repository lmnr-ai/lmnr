"use client";

import { X } from "lucide-react";

import { StatusIcon } from "./status-icon";
import { type ModelTestStatus, STATUS_ICON_SIZE } from "./types";

export function ModelRow({
  model,
  status,
  onRemove,
}: {
  model: string;
  status: ModelTestStatus;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 min-h-8 px-2 text-xs border-b last:border-b-0">
      <span className="flex-1 min-w-0 truncate" title={model}>
        {model}
      </span>
      <StatusIcon status={status} />
      <button
        type="button"
        aria-label={`Remove ${model}`}
        onClick={onRemove}
        disabled={status.state === "testing"}
        className="text-muted-foreground hover:text-destructive transition-colors disabled:opacity-40"
      >
        <X size={STATUS_ICON_SIZE} />
      </button>
    </li>
  );
}
