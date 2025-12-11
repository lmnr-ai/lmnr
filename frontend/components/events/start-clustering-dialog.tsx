"use client";

import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { PropsWithChildren, useCallback, useState } from "react";
import { Controller, useForm } from "react-hook-form";

import { useEventsStoreContext } from "@/components/events/events-store";
import { Button } from "@/components/ui/button";
import { mustache } from "@/components/ui/content-renderer/lang-mustache";
import { baseExtensions, theme } from "@/components/ui/content-renderer/utils.ts";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { EventClusterConfig } from "@/lib/actions/cluster-configs";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface StartClusteringForm {
  valueTemplate: string;
}

interface StartClusteringDialogProps {
  eventName: string;
  eventType: "SEMANTIC" | "CODE";
}

export default function StartClusteringDialog({ children, eventName, eventType }: PropsWithChildren<StartClusteringDialogProps>) {
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
    formState: { isValid },
  } = useForm<StartClusteringForm>({
    defaultValues: { valueTemplate: "" },
    mode: "onChange",
  });

  const submit = useCallback(
    async (data: StartClusteringForm) => {
      try {
        setIsLoading(true);

        const res = await fetch(`/api/projects/${projectId}/events/${eventName}/cluster-config`, {
          method: "POST",
          body: JSON.stringify({
            valueTemplate: data.valueTemplate,
            eventSource: eventType,
          }),
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

        const result = (await res.json()) as EventClusterConfig | undefined;

        if (result) {
          setClusterConfig(result);
        }

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
    [projectId, eventName, eventType, toast, setClusterConfig, reset]
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
                <CodeMirror
                  value={field.value}
                  onChange={field.onChange}
                  theme={theme}
                  basicSetup={false}
                  extensions={[mustache, ...baseExtensions.filter(ext => ext !== EditorView.lineWrapping)]}
                  placeholder="{{input}}"
                  className="rounded-md border p-0.5 text-sm focus-within:border-primary"
                />
              )}
            />
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
