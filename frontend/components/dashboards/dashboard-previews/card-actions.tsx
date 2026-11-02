import { Pen, Trash2 } from "lucide-react";

import ActionButton from "./action-button";

interface CardActionsProps {
  onRename: () => void;
  onDelete?: () => void;
}

/** Rename and delete buttons pinned to a preview's top-right corner, shown on hover. */
const CardActions = ({ onRename, onDelete }: CardActionsProps) => (
  <div className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
    <ActionButton aria-label="Rename dashboard" onClick={onRename}>
      <Pen className="size-3" />
    </ActionButton>
    {onDelete && (
      <ActionButton aria-label="Delete dashboard" className="hover:text-destructive" onClick={onDelete}>
        <Trash2 className="size-3" />
      </ActionButton>
    )}
  </div>
);

export default CardActions;
