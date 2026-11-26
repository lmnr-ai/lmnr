import { Ellipsis, Pen, Trash2 } from "lucide-react";
import { type PropsWithChildren } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface AlertRowMenuProps {
  onEdit: () => void;
  onDelete: () => void;
}

/** Edit and Delete, with any extra items of the caller between them. */
export default function AlertRowMenu({ onEdit, onDelete, children }: PropsWithChildren<AlertRowMenuProps>) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label="More options"
          variant="ghost"
          size="icon"
          className="size-7 text-muted-foreground"
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => e.stopPropagation()}
        >
          <Ellipsis className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-32" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={onEdit} className="cursor-pointer">
          <Pen className="size-3.5" />
          Edit
        </DropdownMenuItem>
        {children}
        <DropdownMenuItem onClick={onDelete} variant="destructive" className="cursor-pointer">
          <Trash2 className="size-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
