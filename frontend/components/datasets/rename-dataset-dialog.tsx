"use client";

import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { PropsWithChildren, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface RenameDatasetDialogProps {
  dataset: Dataset;
}

export default function RenameDatasetDialog({ dataset, children }: PropsWithChildren<RenameDatasetDialogProps>) {
  const { projectId } = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const [newName, setNewName] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleRename = async () => {
    if (!newName.trim()) return;

    setIsLoading(true);

    try {
      const response = await fetch(`/api/projects/${projectId}/datasets/${dataset.id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: newName.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to rename dataset");
      }

      const updatedDataset = await response.json();

      toast({
        title: "Dataset Renamed",
        description: `Dataset renamed to "${updatedDataset.name}" successfully!`,
      });

      setIsOpen(false);
      setNewName("");
      router.refresh();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: error instanceof Error ? error.message : "Something went wrong. Please try again later.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      setNewName("");
    }
  };

  return (
    <div onClick={(e) => e.stopPropagation()}>
      <Dialog open={isOpen} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>
          {children || (
            <Button icon="edit" variant="secondary">
              Rename
            </Button>
          )}
        </DialogTrigger>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename dataset</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder={dataset.name}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newName.trim() && !isLoading) {
                  handleRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button disabled={!newName.trim() || isLoading} onClick={handleRename}>
              <Loader2 className={cn("mr-2 h-4 w-4", isLoading ? "animate-spin" : "hidden")} />
              Rename
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
