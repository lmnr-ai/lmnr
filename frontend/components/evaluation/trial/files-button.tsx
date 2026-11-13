import { FolderOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FilesButtonProps {
  open: boolean;
  onToggle: () => void;
}

/** Opens or closes the trial's Task / Logs panel; styled like the trace view's Media toggle. */
export default function FilesButton({ open, onToggle }: FilesButtonProps) {
  return (
    <Button
      variant="ghost"
      onClick={onToggle}
      className={cn(
        "flex h-6 items-center bg-emphasis-1 px-1.5 hover:overlay-hover active:overlay-selected",
        open && "text-primary-text hover:text-primary-text"
      )}
    >
      <FolderOpen size={14} className="flex-shrink-0" />
      <span className="ml-1">Files</span>
    </Button>
  );
}
