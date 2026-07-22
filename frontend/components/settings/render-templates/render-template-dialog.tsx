"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";

import {
  defaultTemplateValues,
  type ManageTemplateForm,
  manageTemplateSchema,
  type Template,
  type TemplateScope,
} from "@/components/ui/template-renderer";
import ManageTemplateDialog from "@/components/ui/template-renderer/manage-template-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateId: string | null;
  scope?: TemplateScope;
}

export default function RenderTemplateDialog({ open, onOpenChange, templateId, scope = "span" }: Props) {
  const { projectId } = useParams();
  const methods = useForm<ManageTemplateForm>({
    resolver: zodResolver(manageTemplateSchema),
    defaultValues: defaultTemplateValues,
  });

  useEffect(() => {
    if (!open) {
      methods.reset(defaultTemplateValues);
      return;
    }
    if (!templateId) {
      methods.reset({ ...defaultTemplateValues, scope });
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
        methods.reset({ ...template, scope: template.type ?? scope, testData: "" });
      } catch (e) {
        if (controller.signal.aborted) return;
        toast.error("Error", { description: e instanceof Error ? e.message : "Failed to load template" });
        onOpenChange(false);
      }
    };
    load();
    return () => controller.abort();
  }, [open, templateId, projectId, scope, methods, onOpenChange]);

  const mode = open ? (templateId ? "edit" : "create") : null;
  const close = () => onOpenChange(false);

  return (
    <FormProvider {...methods}>
      <ManageTemplateDialog mode={mode} scope={scope} onCancel={close} onSaved={close} />
    </FormProvider>
  );
}
