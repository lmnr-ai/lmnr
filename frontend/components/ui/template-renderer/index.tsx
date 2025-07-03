import { zodResolver } from "@hookform/resolvers/zod";
import { PencilIcon, Plus, TrashIcon } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useEffect } from "react";
import { FormProvider, useForm } from "react-hook-form";
import useSWR from "swr";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import JsxRenderer from "@/components/ui/template-renderer/jsx-renderer";
import ManageTemplateDialog from "@/components/ui/template-renderer/manage-template-dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

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
  testData: z.string(),
});

export type ManageTemplateForm = z.infer<typeof manageTemplateSchema>;

export const defaultTemplateValues: ManageTemplateForm = {
  name: "",
  code: `function({ data }) {
  // This template uses HTM syntax for data rendering
  
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

  const {
    selectedTemplate,
    isDialogOpen,
    isDeleteDialogOpen,
    setSelectedTemplate,
    setIsDialogOpen,
    setIsDeleteDialogOpen,
    setPresetTemplate,
    getPresetTemplate,
  } = useTemplateRenderer();

  const methods = useForm<ManageTemplateForm>({
    resolver: zodResolver(manageTemplateSchema),
    defaultValues: defaultTemplateValues,
  });

  const { reset } = methods;

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
              setSelectedTemplate(result);
            }
          }
        }
      }
    };

    loadTemplateFromPreset();
  }, [presetKey, templates, projectId, getPresetTemplate, setSelectedTemplate, toast, fetchTemplate]);

  const handleTemplateSelect = async (value: string) => {
    const template = templates?.find((t) => t.id === value);
    if (template) {
      if (presetKey) {
        setPresetTemplate(presetKey, value);
      }
      const result = await fetchTemplate(value);
      if (result) setSelectedTemplate(result);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      const response = await fetch(`/api/projects/${projectId}/render-templates/${selectedTemplate.id}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await mutateTemplates((prev) => prev?.filter((t) => t.id !== selectedTemplate.id));
        setSelectedTemplate(null);
        toast({
          title: "Success",
          description: "Template deleted successfully",
        });
      } else {
        throw new Error("Failed to delete template");
      }
    } catch (error) {
      console.error("Failed to delete template:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to delete template",
      });
    } finally {
      setIsDeleteDialogOpen(false);
    }
  };

  const handleEditTemplate = useCallback(() => {
    if (selectedTemplate) {
      reset({
        id: selectedTemplate.id,
        name: selectedTemplate.name,
        code: selectedTemplate.code,
        testData: data,
      });
      setIsDialogOpen(true);
    }
  }, [selectedTemplate, reset, data, setIsDialogOpen]);

  const handleCreateTemplate = useCallback(() => {
    reset({ ...defaultTemplateValues, testData: data });
    setIsDialogOpen(true);
  }, [data, reset, setIsDialogOpen]);

  const currentTemplateCode = selectedTemplate?.code ?? defaultTemplateValues.code;

  return (
    <FormProvider {...methods}>
      <div className="flex flex-col bg-background w-full">
        <div className="flex items-center gap-2 p-2">
          <Select value={selectedTemplate?.id} onValueChange={handleTemplateSelect}>
            <SelectTrigger className="w-fit">
              <SelectValue placeholder="Select template" />
            </SelectTrigger>
            <SelectContent>
              {templates?.map((template: TemplateInfo) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.name}
                </SelectItem>
              ))}
              <div className="relative flex w-full cursor-pointer hover:bg-secondary items-center rounded-sm py-1.5 pl-2 pr-8 text-sm">
                <Plus className="w-3 h-3 mr-2" />
                <span onClick={handleCreateTemplate} className="text-xs">
                  Create new template
                </span>
              </div>
            </SelectContent>
          </Select>
          {selectedTemplate && (
            <>
              <Button variant="outline" onClick={handleEditTemplate}>
                <PencilIcon className="w-4 h-4" />
              </Button>
              <Button variant="outline" onClick={() => setIsDeleteDialogOpen(true)}>
                <TrashIcon className="w-4 h-4" />
              </Button>
              <ConfirmDialog
                open={isDeleteDialogOpen}
                onOpenChange={setIsDeleteDialogOpen}
                title="Delete Template"
                description={`Are you sure you want to delete "${selectedTemplate.name}"?`}
                confirmText="Delete"
                cancelText="Cancel"
                onConfirm={handleDeleteTemplate}
              />
            </>
          )}
        </div>
        <div className="flex-grow flex overflow-hidden rounded-b">
          <JsxRenderer code={currentTemplateCode} data={data} />
        </div>
        <ManageTemplateDialog testData={data} open={isDialogOpen} onOpenChange={setIsDialogOpen} />
      </div>
    </FormProvider>
  );
}
