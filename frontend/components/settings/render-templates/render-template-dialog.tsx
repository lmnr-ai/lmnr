"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { z } from "zod";

import { defaultTemplateValues, type ManageTemplateForm, type Template } from "@/components/ui/template-renderer";
import ManageTemplateDialog from "@/components/ui/template-renderer/manage-template-dialog";
import { useToast } from "@/lib/hooks/use-toast";

const schema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  testData: z.string().optional(),
});

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
}

export default function RenderTemplateDialog({ open, onOpenChange, templateId }: Props) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const methods = useForm<ManageTemplateForm>({
    resolver: zodResolver(schema),
    defaultValues: defaultTemplateValues,
  });

  useEffect(() => {
    if (!open) {
      methods.reset(defaultTemplateValues);
      return;
    }
    if (!templateId) {
      methods.reset(defaultTemplateValues);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(`/api/projects/${projectId}/render-templates/${templateId}`, {
          signal: controller.signal,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "Failed to load template");
        }
        const template = (await res.json()) as Template;
        methods.reset({ ...template, testData: "" });
      } catch (e) {
        if (controller.signal.aborted) return;
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to load template",
        });
        onOpenChange(false);
      }
    };
    load();
    return () => controller.abort();
  }, [open, templateId, projectId, methods, toast, onOpenChange]);

  return (
    <FormProvider {...methods}>
      <ManageTemplateDialog open={open} onOpenChange={onOpenChange} />
    </FormProvider>
  );
}
