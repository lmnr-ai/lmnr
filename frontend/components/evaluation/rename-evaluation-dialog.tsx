import { useParams, useRouter } from "next/navigation";
import React, { type PropsWithChildren, useCallback, useState } from "react";
import { toast } from "sonner";
import { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Loader2 } from "@/components/ui/icon-lib";
import { Input } from "@/components/ui/input";
import { type EvaluationResultsInfo } from "@/lib/evaluation/types";

import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "../ui/dialog";

const RenameEvaluationDialog = ({
  urlKey,
  defaultValue,
  children,
}: PropsWithChildren<{ urlKey: string; defaultValue?: string }>) => {
  const { projectId, evaluationId } = useParams();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const { mutate } = useSWRConfig();

  const submit = useCallback(async () => {
    try {
      if (!name) return;

      setIsLoading(true);

      const response = await fetch(`/api/projects/${projectId}/evaluations/${evaluationId}`, {
        method: "PATCH",
        body: JSON.stringify({ name }),
      });

      if (!response.ok) {
        toast.error("Error", { description: "Failed to rename evaluation. Please try again." });
      } else {
        await mutate<EvaluationResultsInfo>(
          urlKey,
          (data) => {
            if (data) {
              return { ...data, evaluation: { ...data.evaluation, name } };
            }
            return data;
          },
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );
        toast("Successfully renamed evaluation.");
        router.refresh();
      }
      setOpen(false);
    } catch (e) {
      toast.error("Error", { description: e instanceof Error ? e.message : "Failed to rename evaluation. Please try again." });
    } finally {
      setIsLoading(false);
    }
  }, [evaluationId, mutate, name, projectId, router, urlKey]);

  return (
    <Dialog
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        setName("");
      }}
    >
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>Rename evaluation</DialogTitle>
        </DialogHeader>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={defaultValue} />
        <DialogFooter>
          <Button variant="secondary" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button handleEnter disabled={isLoading || name?.trim() === ""} onClick={submit}>
            {isLoading && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default RenameEvaluationDialog;
