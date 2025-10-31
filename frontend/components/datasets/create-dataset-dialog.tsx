import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DatasetInfo } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function CreateDatasetDialog({
  children,
  onUpdate,
}: PropsWithChildren<{ onUpdate?: (dataset: DatasetInfo) => void }>) {
  const [newDatasetName, setNewDatasetName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { projectId } = useParams();
  const { toast } = useToast();

  const createNewDataset = useCallback(async () => {
    try {
      setIsLoading(true);

      const dataset = {
        name: newDatasetName,
        projectId: projectId,
      };

      const res = await fetch(`/api/projects/${projectId}/datasets`, {
        method: "POST",
        body: JSON.stringify(dataset),
      });

      if (!res.ok) {
        toast({ variant: "destructive", title: "Error", description: "Failed to create the dataset" });
        return;
      }

      const newDataset = (await res.json()) as DatasetInfo;

      const newDatasetWithCount = { ...newDataset, datapointsCount: 0 };

      if (onUpdate) {
        onUpdate(newDatasetWithCount);
      }

      toast({ title: "Successfully created dataset" });
      setIsDialogOpen(false);
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to create the dataset. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  }, [newDatasetName, onUpdate, projectId, toast]);

  return (
    <>
      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          setNewDatasetName("");
        }}
      >
        <DialogTrigger asChild>{children}</DialogTrigger>
        <DialogContent className="sm:max-w-96">
          <DialogHeader>
            <DialogTitle>Create dataset</DialogTitle>
          </DialogHeader>
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Enter name..."
              value={newDatasetName}
              onChange={(e) => setNewDatasetName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button className="w-fit" onClick={createNewDataset} disabled={!newDatasetName || isLoading} handleEnter>
              <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
