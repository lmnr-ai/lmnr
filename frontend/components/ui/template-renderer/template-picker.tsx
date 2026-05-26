import { zodResolver } from "@hookform/resolvers/zod";
import { Check, ChevronDown, Loader2, PencilIcon, Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { createContext, type PropsWithChildren, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import JsxRenderer from "@/components/ui/template-renderer/jsx-renderer";
import ManageTemplateDialog from "@/components/ui/template-renderer/manage-template-dialog";
import { swrFetcher } from "@/lib/api/fetch-api.ts";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { defaultTemplateValues, type ManageTemplateForm, manageTemplateSchema, type Template } from "./index";
import { useTemplateRenderer } from "./template-renderer-store";

export type ManageTemplateMode = "create" | "edit" | null;

interface TemplateInfo {
  id: string;
  name: string;
}

interface TemplatePickerContextValue {
  templates: TemplateInfo[] | undefined;
  selectedTemplate: Template | null;
  isLoadingTemplate: boolean;
  selectTemplate: (templateId: string) => Promise<void>;
  openCreate: () => void;
  openEdit: () => void;
}

const TemplatePickerContext = createContext<TemplatePickerContextValue | null>(null);

export const useTemplatePicker = () => {
  const ctx = useContext(TemplatePickerContext);
  if (!ctx) throw new Error("useTemplatePicker must be used inside <TemplatePickerProvider>");
  return ctx;
};

interface TemplatePickerProviderProps {
  presetKey: string | null;
  testData: string;
}

export const TemplatePickerProvider = ({
  presetKey,
  testData,
  children,
}: PropsWithChildren<TemplatePickerProviderProps>) => {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { data: templates } = useSWR<TemplateInfo[]>(`/api/projects/${projectId}/render-templates`, swrFetcher);

  const { setPresetTemplate, getPresetTemplate } = useTemplateRenderer();

  const methods = useForm<ManageTemplateForm>({
    resolver: zodResolver(manageTemplateSchema),
    defaultValues: defaultTemplateValues,
  });
  const { reset, getValues, control } = methods;
  const form = useWatch({ control });

  const [manageMode, setManageMode] = useState<ManageTemplateMode>(null);
  const [backup, setBackup] = useState<ManageTemplateForm | null>(null);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const fetchTemplate = useCallback(
    async (templateId: string): Promise<Template | null> => {
      try {
        const res = await fetch(`/api/projects/${projectId}/render-templates/${templateId}`);
        if (!res.ok) {
          const err = await res.json().catch(() => null);
          throw new Error(err?.error ?? "Failed to fetch template");
        }
        return (await res.json()) as Template;
      } catch (e) {
        toast({
          variant: "destructive",
          title: "Error",
          description: e instanceof Error ? e.message : "Failed to fetch template",
        });
        return null;
      }
    },
    [projectId, toast]
  );

  // Hydrate from persisted preset once templates load. `testData` omitted intentionally —
  // hydration is one-shot, not a per-keystroke refetch.
  useEffect(() => {
    const load = async () => {
      if (!presetKey || !templates) return;
      const storedId = getPresetTemplate(presetKey);
      if (!storedId) return;
      if (!templates.find((t) => t.id === storedId)) return;
      setIsLoadingTemplate(true);
      try {
        const full = await fetchTemplate(storedId);
        if (full) reset({ ...full, testData });
      } finally {
        setIsLoadingTemplate(false);
      }
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetKey, templates, getPresetTemplate, fetchTemplate, reset]);

  const selectTemplate = useCallback(
    async (templateId: string) => {
      const t = templates?.find((x) => x.id === templateId);
      if (!t) return;
      if (presetKey) setPresetTemplate(presetKey, templateId);
      setIsLoadingTemplate(true);
      try {
        const full = await fetchTemplate(templateId);
        if (full) reset({ ...full, testData });
      } finally {
        setIsLoadingTemplate(false);
      }
    },
    [templates, presetKey, setPresetTemplate, fetchTemplate, reset, testData]
  );

  const openCreate = useCallback(() => {
    setBackup(getValues());
    reset({ ...defaultTemplateValues, testData });
    setManageMode("create");
  }, [getValues, reset, testData]);

  const openEdit = useCallback(() => {
    const current = getValues();
    setBackup(current);
    reset({ ...current, testData });
    setManageMode("edit");
  }, [getValues, reset, testData]);

  const cancelManage = useCallback(() => {
    if (backup) reset(backup);
    setBackup(null);
    setManageMode(null);
  }, [backup, reset]);

  const completeSave = useCallback(() => {
    setBackup(null);
    setManageMode(null);
  }, []);

  const selectedTemplate = useMemo<Template | null>(() => {
    if (!form?.id || !form?.name || !form?.code) return null;
    return { id: form.id, name: form.name, code: form.code };
  }, [form?.id, form?.name, form?.code]);

  const contextValue = useMemo<TemplatePickerContextValue>(
    () => ({
      templates,
      selectedTemplate,
      isLoadingTemplate,
      selectTemplate,
      openCreate,
      openEdit,
    }),
    [templates, selectedTemplate, isLoadingTemplate, selectTemplate, openCreate, openEdit]
  );

  return (
    <FormProvider {...methods}>
      <TemplatePickerContext.Provider value={contextValue}>
        {children}
        <ManageTemplateDialog mode={manageMode} onCancel={cancelManage} onSaved={completeSave} />
      </TemplatePickerContext.Provider>
    </FormProvider>
  );
};

interface TemplatePickerViewProps {
  mode: string;
  onModeChange: (mode: string) => void;
  modes: string[];
  triggerClassName?: string;
}

// Shared CommandGroup heading styles use `**:` (grandchild) selectors, but cmdk
// renders the heading as a direct child — so defaults don't apply. Override here.
const GROUP_CLASS =
  "[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[0.65rem] [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted-foreground";

const formatLabel = (m: string) => (m.toLowerCase() === "messages" ? "LLM Messages" : m);

export const TemplatePickerView = ({ mode, onModeChange, modes, triggerClassName }: TemplatePickerViewProps) => {
  const { templates, selectedTemplate, selectTemplate, openCreate } = useTemplatePicker();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const handleOpenChange = useCallback((next: boolean) => {
    setOpen(next);
    if (!next) setSearch("");
  }, []);

  const formats = useMemo(() => modes.filter((m) => m.toLowerCase() !== "custom"), [modes]);

  const filteredTemplates = useMemo(() => {
    if (!templates) return [];
    const q = search.trim().toLowerCase();
    if (!q) return templates;
    return templates.filter((t) => t.name.toLowerCase().includes(q));
  }, [templates, search]);

  const inCustomMode = mode === "custom";
  const triggerLabel = inCustomMode
    ? (selectedTemplate?.name ?? "Select template")
    : formatLabel(modes.find((m) => m.toLowerCase() === mode) ?? mode.toUpperCase());

  const handlePickFormat = useCallback(
    (m: string) => {
      onModeChange(m.toLowerCase());
      setOpen(false);
    },
    [onModeChange]
  );

  const handlePickTemplate = useCallback(
    (id: string) => {
      onModeChange("custom");
      void selectTemplate(id);
      setOpen(false);
    },
    [onModeChange, selectTemplate]
  );

  const handleCreate = useCallback(() => {
    openCreate();
    setOpen(false);
  }, [openCreate]);

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "h-5 gap-1 rounded-md border border-secondary-foreground/20 bg-muted px-1.5 text-[0.7rem] font-medium text-secondary-foreground hover:bg-muted",
            triggerClassName
          )}
        >
          <span className={cn("truncate max-w-[160px]")}>
            {triggerLabel} {inCustomMode && <span className="font-semibold">(custom)</span>}
          </span>
          <ChevronDown className="size-3 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[280px] p-0" onWheel={(e) => e.stopPropagation()}>
        <Command shouldFilter={false}>
          <CommandList className="max-h-none overflow-visible">
            <ScrollArea className="max-h-[360px] [&>div]:max-h-[360px]">
              <CommandGroup heading="Default" className={GROUP_CLASS}>
                {formats.map((m) => {
                  const value = m.toLowerCase();
                  const active = !inCustomMode && mode === value;
                  return (
                    <CommandItem
                      key={m}
                      value={`format:${value}`}
                      onSelect={() => handlePickFormat(m)}
                      className="text-xs"
                    >
                      <span className="flex-1 truncate uppercase tracking-wide">{formatLabel(m)}</span>
                      {active && <Check className="ml-2 size-3.5 shrink-0" />}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator alwaysRender />
              <CommandInput
                placeholder="Search templates…"
                value={search}
                onValueChange={setSearch}
                className="h-8 py-1 text-xs"
              />
              <CommandGroup heading="Custom" className={GROUP_CLASS}>
                {filteredTemplates.length === 0 ? (
                  <div className="px-2 py-3 text-center text-xs text-muted-foreground">
                    {templates?.length ? "No matches." : "No templates yet."}
                  </div>
                ) : (
                  filteredTemplates.map((t) => {
                    const active = inCustomMode && selectedTemplate?.id === t.id;
                    return (
                      <CommandItem
                        key={t.id}
                        value={`template:${t.id}`}
                        onSelect={() => handlePickTemplate(t.id)}
                        className="text-xs"
                      >
                        <span className="flex-1 truncate">{t.name}</span>
                        {active && <Check className="ml-2 size-3.5 shrink-0" />}
                      </CommandItem>
                    );
                  })
                )}
              </CommandGroup>
              <CommandSeparator alwaysRender />
              <CommandGroup className={GROUP_CLASS}>
                <CommandItem onSelect={handleCreate} className="text-xs text-muted-foreground">
                  <Plus className="mr-1.5 size-3.5" />
                  New template
                </CommandItem>
              </CommandGroup>
            </ScrollArea>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
};

export const TemplatePickerActions = ({ className }: { className?: string }) => {
  const { selectedTemplate, openEdit } = useTemplatePicker();
  if (!selectedTemplate) return null;
  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 gap-1 px-1.5 text-xs text-muted-foreground"
        onClick={openEdit}
        title="Edit template"
      >
        <PencilIcon className="size-3.5" />
        Edit template
      </Button>
    </div>
  );
};

interface TemplatePickerPreviewProps {
  data: string;
  className?: string;
}

export const TemplatePickerPreview = ({ data, className }: TemplatePickerPreviewProps) => {
  const { selectedTemplate, openCreate, templates, isLoadingTemplate } = useTemplatePicker();

  if (isLoadingTemplate) {
    return (
      <div className={cn("flex flex-1 items-center justify-center text-muted-foreground min-h-40", className)}>
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  if (!selectedTemplate) {
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 px-4 py-8 text-xs", className)}>
        <p className="text-muted-foreground text-center">
          {templates && templates.length > 0
            ? "Pick a template from the dropdown to render this content."
            : "Create a template to render this content as a custom view."}
        </p>
        <Button variant="secondary" onClick={openCreate}>
          <Plus className="mr-1.5 size-3.5" />
          Template
        </Button>
      </div>
    );
  }

  return <JsxRenderer className={cn("rounded-none", className)} code={selectedTemplate.code} data={data} autoHeight />;
};
