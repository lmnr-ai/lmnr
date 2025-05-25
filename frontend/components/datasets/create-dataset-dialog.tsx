import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dataset } from "@/lib/dataset/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function CreateDatasetDialog({
  children,
  onSuccess,
}: PropsWithChildren<{ onSuccess?: (dataset: Dataset) => void }>) {
  const [newDatasetName, setNewDatasetName] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

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

      const newDataset = (await res.json()) as Dataset;

      await mutate<PaginatedResponse<Dataset>>(
        `/api/projects/${projectId}/datasets`,
        (currentData) =>
          currentData
            ? { items: [newDataset, ...currentData.items], totalCount: currentData.totalCount + 1 }
            : { items: [newDataset], totalCount: 1 },
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );

      if (onSuccess) {
        onSuccess(newDataset);
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
  }, [mutate, newDatasetName, onSuccess, projectId, toast]);

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
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Create new dataset</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Label>Name</Label>
            <Input
              autoFocus
              placeholder="Name"
              value={newDatasetName}
              onChange={(e) => setNewDatasetName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && createNewDataset()}
            />
          </div>
          <DialogFooter>
            <Button onClick={createNewDataset} disabled={!newDatasetName || isLoading} handleEnter>
              <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={16} />
              Create
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
