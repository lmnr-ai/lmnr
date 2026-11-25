"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { fetchApi } from "@/lib/api/fetch-api";
import { useToast } from "@/lib/hooks/use-toast";

interface DeleteVersionButtonProps {
  projectId: string;
  agentId: string;
  versionId: string;
  versionNumber: number;
  onDeleted: () => void;
}

export default function DeleteVersionButton({
  projectId,
  agentId,
  versionId,
  versionNumber,
  onDeleted,
}: DeleteVersionButtonProps) {
  const [open, setOpen] = useState(false);
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
      <Button
        variant="ghost"
        size="sm"
        className="self-start px-0 text-muted-foreground"
        disabled={isLoading}
        onClick={() => setOpen(true)}
      >
        <Trash2 className="mr-1 size-3" />
        Delete version
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete v${versionNumber}?`}
        description="Delete a version that isn't a real change, such as an optional tool that only some traces have. Its traces, models and releases move to the version before it."
        confirmText="Delete"
        onConfirm={remove}
      />
    </>
  );
}
