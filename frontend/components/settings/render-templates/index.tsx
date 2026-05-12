"use client";

import { isEmpty } from "lodash";
import { Pencil, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "../settings-section";
import RenderTemplateDialog from "./render-template-dialog";

interface TemplateInfo {
  id: string;
  name: string;
}

export default function RenderTemplates() {
  const { projectId } = useParams();
  const { toast } = useToast();
  const {
    data: templates,
    isLoading,
    mutate,
  } = useSWR<TemplateInfo[]>(`/api/projects/${projectId}/render-templates`, swrFetcher);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<TemplateInfo | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const openCreate = useCallback(() => {
    setEditingTemplateId(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((templateId: string) => {
    setEditingTemplateId(templateId);
    setDialogOpen(true);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!templateToDelete) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/render-templates/${templateToDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Failed to delete template");
      }
      await mutate();
      toast({ title: "Template deleted" });
    } catch (e) {
      toast({
        variant: "destructive",
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to delete template",
      });
    } finally {
      setIsDeleting(false);
      setTemplateToDelete(null);
    }
  }, [templateToDelete, projectId, mutate, toast]);

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Render templates"
        description="JSX templates used to visualize trace, span and evaluation data across the platform. Each template is scoped to this project."
      />
      <Button variant="outline" icon="plus" className="w-fit" onClick={openCreate}>
        New template
      </Button>
      <SettingsTable
        isLoading={isLoading}
        isEmpty={isEmpty(templates)}
        emptyMessage="No render templates yet."
        headers={["Name", ""]}
        colSpan={2}
      >
        {templates?.map((template) => (
          <SettingsTableRow key={template.id}>
            <td className="px-4 text-sm font-medium">{template.name}</td>
            <td className="px-4">
              <div className="flex justify-end gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => openEdit(template.id)}
                  title="Edit template"
                >
                  <Pencil className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={() => setTemplateToDelete(template)}
                  title="Delete template"
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            </td>
          </SettingsTableRow>
        ))}
      </SettingsTable>

      <RenderTemplateDialog open={dialogOpen} onOpenChange={setDialogOpen} templateId={editingTemplateId} />

      <ConfirmDialog
        open={!!templateToDelete}
        onOpenChange={(open) => !open && setTemplateToDelete(null)}
        title="Delete template"
        description={`Are you sure you want to delete "${templateToDelete?.name ?? ""}"? This cannot be undone.`}
        confirmText={isDeleting ? "Deleting..." : "Delete"}
        cancelText="Cancel"
        onConfirm={handleDelete}
      />
    </SettingsSection>
  );
}
