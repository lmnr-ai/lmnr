"use client";

import { Ellipsis, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface VersionActionsMenuProps {
  projectId: string;
  agentId: string;
  versionId: string;
  versionNumber: number;
  onDeleted: () => void;
  /** Takes no width until a `group` ancestor is hovered, like `CardExpandIndicator`'s label. */
  collapsed?: boolean;
  className?: string;
}

export default function VersionActionsMenu({
  projectId,
  agentId,
  versionId,
  versionNumber,
  onDeleted,
  collapsed,
  className,
}: VersionActionsMenuProps) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const remove = async () => {
    setIsLoading(true);
    const { error } = await fetchApi(`/api/projects/${projectId}/agents/${agentId}/versions/${versionId}`, {
      method: "DELETE",
    });
    setIsLoading(false);
    if (error) {
      toast({ variant: "destructive", title: "Failed to delete version", description: error });
      return;
    }
    onDeleted();
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            aria-label="Version actions"
            variant="ghost"
            size="icon-sm"
            className={cn(
              "mr-1 overflow-hidden text-muted-foreground transition-all duration-200",
              collapsed &&
                "mr-0 w-0 opacity-0 group-hover:mr-1 group-hover:w-6 group-hover:opacity-100 focus-visible:mr-1 focus-visible:w-6 focus-visible:opacity-100 data-[state=open]:mr-1 data-[state=open]:w-6 data-[state=open]:opacity-100",
              className
            )}
            disabled={isLoading}
          >
            <Ellipsis className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem variant="destructive" className="cursor-pointer" onClick={() => setConfirmOpen(true)}>
            <Trash2 className="size-3.5" />
            Delete version
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Delete v${versionNumber}?`}
        description="Its traces, models and releases move to the version before it."
        confirmText="Delete"
        onConfirm={remove}
      />
    </>
  );
}
