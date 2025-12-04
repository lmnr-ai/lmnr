"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useEventsStoreContext } from "@/components/events/events-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Textarea } from "../ui/textarea";

interface StartClusteringForm {
  valueTemplate: string;
}

interface StartClusteringDialogProps {
  eventName: string;
}

export default function StartClusteringDialog({
  children,
  eventName,
}: PropsWithChildren<StartClusteringDialogProps>) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const { projectId } = useParams();
  const { toast } = useToast();

  const { setClusterConfig } = useEventsStoreContext((state) => ({
    setClusterConfig: state.setClusterConfig,
  }));

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<StartClusteringForm>({
    defaultValues: { valueTemplate: "" },
  });

  const submit = useCallback(
    async (data: StartClusteringForm) => {
      try {
        setIsLoading(true);

        const res = await fetch(`/api/projects/${projectId}/events/${eventName}/cluster-config`, {
          method: "POST",
          body: JSON.stringify({ valueTemplate: data.valueTemplate }),
        });

        if (!res.ok) {
          const error = await res.json();
          toast({
            variant: "destructive",
            title: "Error",
            description: error.error || "Failed to start clustering",
          });
          return;
        }

        const result = await res.json();
        setClusterConfig({ id: result.id, valueTemplate: result.valueTemplate });

        toast({ title: "Clustering started successfully" });
        setOpen(false);
        reset();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to start clustering",
        });
      } finally {
        setIsLoading(false);
      }
    },
    [projectId, eventName, toast, setClusterConfig, reset]
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start Clustering</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(submit)} className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="valueTemplate">Value Template</Label>
            <p className="text-xs text-muted-foreground">
              Use mustache-like syntax to define the clustering value template.
            </p>
            <Controller
              rules={{ required: "Value template is required" }}
              name="valueTemplate"
              control={control}
              render={({ field }) => (
                <Textarea rows={3} id="valueTemplate" placeholder="{{input}}" autoFocus {...field} />
              )}
            />
            {errors.valueTemplate && (
              <p className="text-xs text-destructive">{errors.valueTemplate.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" type="button" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !isValid}>
              <Loader2 className={cn("mr-2 hidden", isLoading && "animate-spin block")} size={16} />
              Start
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

