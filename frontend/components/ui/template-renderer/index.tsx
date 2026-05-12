import { zodResolver } from "@hookform/resolvers/zod";
import { ChevronDown, PencilIcon, Plus, TrashIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import JsxRenderer from "@/components/ui/template-renderer/jsx-renderer";
import ManageTemplateDialog from "@/components/ui/template-renderer/manage-template-dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { cn, swrFetcher } from "@/lib/utils";

import { useTemplateRenderer } from "./template-renderer-store";

interface TemplateRendererProps {
  data: string;
  presetKey?: string | null;
}

export interface Template {
  id: string;
  name: string;
  code: string;
}

interface TemplateInfo {
  id: string;
  name: string;
}

const manageTemplateSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Template name is required"),
  code: z.string().min(1, "Template code is required"),
  testData: z.string().optional(),
});

export type ManageTemplateForm = z.infer<typeof manageTemplateSchema>;

export const defaultTemplateValues: ManageTemplateForm = {
  name: "",
  code: `function({ data }) {
  // This template uses HTML syntax for data rendering

  return (
    <div>
      Data {JSON.stringify(data)}
    </div>
  );
}`,
  testData: "",
};

export default function TemplateRenderer({ data, presetKey = null }: TemplateRendererProps) {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { data: templates, mutate: mutateTemplates } = useSWR<TemplateInfo[]>(
    `/api/projects/${projectId}/render-templates`,
    swrFetcher
  );

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [savedFormState, setSavedFormState] = useState<ManageTemplateForm | null>(null);

  const { setPresetTemplate, getPresetTemplate } = useTemplateRenderer();

  const methods = useForm<ManageTemplateForm>({
    resolver: zodResolver(manageTemplateSchema),
    defaultValues: defaultTemplateValues,
  });

  const { reset, control, getValues } = methods;

  const template = useWatch({ control });

  const fetchTemplate = useCallback(
    async (templateId: string): Promise<Template | null> => {
      try {
        const response = await fetch(`/api/projects/${projectId}/render-templates/${templateId}`);

        if (response.ok) {
          return (await response.json()) as Template;
        } else {
          const errorData = await response.json();
          throw new Error(errorData?.error || "Request failed. Please try again.");
        }
      } catch (e) {
        toast({
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to fetch template",
          variant: "destructive",
        });
        return null;
      }
    },
    [projectId, toast]
  );

  useEffect(() => {
    const loadTemplateFromPreset = async () => {
      if (presetKey && templates) {
        const storedTemplateId = getPresetTemplate(presetKey);
        if (storedTemplateId) {
          if (templates.find((t) => t.id === storedTemplateId)) {
            const result = await fetchTemplate(storedTemplateId);
            if (result) {
              reset({ ...result, testData: data });
            }
          }
        }
      }
    };

    loadTemplateFromPreset();
  }, [presetKey, templates, projectId, getPresetTemplate, reset, toast, fetchTemplate, data]);

  const handleTemplateSelect = async (templateId: string) => {
    const t = templates?.find((t) => t.id === templateId);
    if (!t) return;
    if (presetKey) {
      setPresetTemplate(presetKey, templateId);
    }
    const result = await fetchTemplate(templateId);
    if (result) reset({ ...result, testData: data });
  };

  const handleDeleteTemplate = async () => {
    if (!template || !template?.id) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/render-templates/${template.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await mutateTemplates((prev) => prev?.filter((t) => t.id !== template.id));
        reset(defaultTemplateValues);
        toast({ title: "Success", description: "Template deleted successfully" });
      } else {
        throw new Error("Failed to delete template");
      }
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete template",
        variant: "destructive",
      });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  const handleEditTemplate = useCallback(() => {
    setSavedFormState(getValues());
    setIsDialogOpen(true);
  }, [getValues]);

  const handleCreateTemplate = useCallback(() => {
    setSavedFormState(getValues());
    reset({ ...defaultTemplateValues, testData: data });
    setIsDialogOpen(true);
  }, [data, reset, getValues]);

  const handleDialogOpenChange = useCallback(
    (open: boolean) => {
      setIsDialogOpen(open);
      if (!open && savedFormState) {
        reset(savedFormState);
        setSavedFormState(null);
      }
    },
    [savedFormState, reset]
  );

  const currentTemplateCode = template?.code ?? defaultTemplateValues.code;
  const hasTemplates = !!templates && templates.length > 0;
  const selectedTemplateName = template?.id ? template?.name : null;

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col bg-background w-full h-full relative">
        <div className="flex items-center justify-end gap-1 px-2 py-1.5 border-b bg-background/80 backdrop-blur-sm">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" className="h-6 px-2 gap-1.5 text-xs font-normal max-w-[220px]">
                <span className="truncate">
                  {selectedTemplateName ?? (hasTemplates ? "Select template" : "No templates")}
                </span>
                <ChevronDown className="size-3 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[220px]">
              {hasTemplates &&
                templates!.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => handleTemplateSelect(t.id)}
                    className={cn("text-xs", template?.id === t.id && "bg-secondary")}
                  >
                    <span className="truncate">{t.name}</span>
                  </DropdownMenuItem>
                ))}
              {hasTemplates && <DropdownMenuSeparator />}
              <DropdownMenuItem onClick={handleCreateTemplate} className="text-xs">
                <Plus className="size-3.5 mr-2" />
                Create new template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {template?.id && (
            <>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                onClick={handleEditTemplate}
                title="Edit template"
              >
                <PencilIcon className="size-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => setIsDeleteDialogOpen(true)}
                title="Delete template"
              >
                <TrashIcon className="size-3.5" />
              </Button>
            </>
          )}
        </div>

        <div className="grow flex overflow-hidden">
          <JsxRenderer className="rounded-none" code={currentTemplateCode} data={data} />
        </div>

        <ManageTemplateDialog testData={data} open={isDialogOpen} onOpenChange={handleDialogOpenChange} />

        {template && (
          <ConfirmDialog
            open={isDeleteDialogOpen}
            onOpenChange={setIsDeleteDialogOpen}
            title="Delete Template"
            description={`Are you sure you want to delete "${template.name}"?`}
            confirmText="Delete"
            cancelText="Cancel"
            onConfirm={handleDeleteTemplate}
          />
        )}
      </div>
    </FormProvider>
  );
}
