import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import useSWR, { useSWRConfig } from "swr";

import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import { type ManageTemplateForm, type Template, type TemplateScope } from "../index";
import { type ManageTemplateMode } from "../template-picker";
import LeftColumn from "./left-column";
import RightPanel from "./right-panel";

interface Props {
  mode: ManageTemplateMode;
  scope?: TemplateScope;
  /** Trace whose span outline enriches the copied AI prompt (trace scope only). */
  traceId?: string;
  onCancel: () => void;
  onSaved: () => void;
}

const ManageTemplateDialog = ({ mode, scope = "span", traceId, onCancel, onSaved }: Props) => {
  const { projectId } = useParams();
  const { toast } = useToast();
  const { mutate } = useSWRConfig();

  const { control, handleSubmit, reset, getValues, setValue } = useFormContext<ManageTemplateForm>();
  const effectiveScope = useWatch({ control, name: "scope" }) ?? scope;
  const code = useWatch({ control, name: "code" });

  const { data: spanOutline } = useSWR<unknown[]>(
    mode !== null && effectiveScope === "trace" && traceId
      ? `/api/projects/${projectId}/traces/${traceId}/span-outline`
      : null,
    swrFetcher
  );

  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [describeText, setDescribeText] = useState("");
  const [activeTab, setActiveTab] = useState("preview");

  const handleGenerate = useCallback(async () => {
    if (!describeText.trim()) {
      toast({ variant: "destructive", title: "Describe what you want the template to render first." });
      return;
    }
    setIsGenerating(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/render-templates/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: effectiveScope,
          description: describeText,
          currentCode: getValues("code"),
          ...(effectiveScope === "trace"
            ? {
                currentWhereClause: getValues("whereClause") ?? null,
                traceOutline: spanOutline ? JSON.stringify(spanOutline) : undefined,
              }
            : { sampleData: getValues("testData") }),
        }),
      });
      if (!res.ok) {
        const errMessage = await res
          .json()
          .then((d) => d?.error)
          .catch(() => null);
        toast({ variant: "destructive", title: "Error", description: errMessage ?? "Failed to generate template" });
        return;
      }
      const result = (await res.json()) as { code: string; whereClause?: string };
      setValue("code", result.code, { shouldDirty: true });
      if (effectiveScope === "trace" && result.whereClause !== undefined) {
        setValue("whereClause", result.whereClause, { shouldDirty: true });
      }
      setDescribeText("");
      setActiveTab("preview");
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to generate template",
      });
    } finally {
      setIsGenerating(false);
    }
  }, [projectId, effectiveScope, describeText, getValues, setValue, spanOutline, toast]);

  const submit = useCallback(
    async (data: ManageTemplateForm) => {
      const isUpdate = !!data.id;
      const dataScope = data.scope ?? scope;
      const baseUrl = `/api/projects/${projectId}/render-templates`;
      try {
        setIsSaving(true);
        const res = await fetch(isUpdate ? `${baseUrl}/${data.id}` : baseUrl, {
          method: isUpdate ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: data.name,
            code: data.code,
            ...(!isUpdate && { type: dataScope }),
            ...(dataScope === "trace" && { whereClause: data.whereClause ?? null }),
          }),
        });

        if (!res.ok) {
          const errMessage = await res
            .json()
            .then((d) => d?.error)
            .catch(() => null);
          toast({
            variant: "destructive",
            title: "Error",
            description: errMessage ?? `Failed to ${isUpdate ? "update" : "create"} the template`,
          });
          return;
        }

        // Preserve testData — the API response only carries {id, name, code, ...}.
        const result = (await res.json()) as Template;
        await mutate((key) => typeof key === "string" && key.startsWith(baseUrl));
        reset({ ...result, scope: dataScope, testData: data.testData });
        toast({ title: `Template ${isUpdate ? "updated" : "created"}` });
        onSaved();
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : `Failed to ${isUpdate ? "update" : "create"} the template`,
        });
      } finally {
        setIsSaving(false);
      }
    },
    [projectId, mutate, toast, reset, onSaved, scope]
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onCancel();
    },
    [onCancel]
  );

  const title = `${mode === "edit" ? "Edit" : "Create a"} custom render template`;

  return (
    <Dialog open={mode !== null} onOpenChange={handleOpenChange}>
      <DialogContent
        className="flex h-[600px] w-[960px] max-w-none overflow-hidden rounded-lg border p-0 outline-0"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        {/* Visually-hidden a11y title/description — the visible header lives in LeftColumn. */}
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">
          Generate or write custom JSX to render your data however you want.
        </DialogDescription>

        <form onSubmit={handleSubmit(submit)} className="flex h-full w-full overflow-hidden">
          <LeftColumn
            title={title}
            isGenerating={isGenerating}
            describeText={describeText}
            onDescribeChange={setDescribeText}
            onGenerate={handleGenerate}
          />
          <RightPanel
            scope={effectiveScope}
            traceId={traceId}
            spanOutline={spanOutline}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onCancel={onCancel}
            isSaving={isSaving}
            canSave={!!code?.trim()}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default ManageTemplateDialog;
