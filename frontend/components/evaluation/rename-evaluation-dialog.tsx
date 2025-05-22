import { Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { PropsWithChildren, useCallback, useState } from "react";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useToast } from "@/lib/hooks/use-toast";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

const RenameEvaluationDialog = ({ urlKey, children }: PropsWithChildren<{ urlKey: string }>) => {
  const { projectId, evaluationId } = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  const submit = useCallback(async () => {
    try {
      setIsLoading(true);

      const response = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        toast({
          title: "Error",
          description: "Failed to rename evaluation. Please try again.",
          variant: "destructive",
        });
      } else {
        await mutate<EvaluationResultsInfo>(
          urlKey,
          (data) => {
            console.log("hererro", data, urlKey);
            if (data) {
              return { ...data, evaluation: { ...data.evaluation, name } };
            }
          },
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );
        toast({ title: "Successfully renamed evaluation." });
        router.refresh();
      }
      setOpen(false);
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to rename evaluation. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [evaluationId, mutate, name, projectId, router, toast, urlKey]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename evaluation</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="New evaluation name" />

        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button handleEnter disabled={isLoading || name.trim() === ""} onClick={submit}>
            {isLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameEvaluationDialog;
