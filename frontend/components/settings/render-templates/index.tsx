"use client";

import { isEmpty } from "lodash";
import { Pencil, Trash2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button";
import { formatTimestamp, swrFetcher } from "@/lib/utils";

import { SettingsSection, SettingsSectionHeader, SettingsTable, SettingsTableRow } from "../settings-section";
import DeleteRenderTemplateDialog from "./delete-render-template-dialog";
import RenderTemplateDialog from "./render-template-dialog";

interface TemplateInfo {
  id: string;
  name: string;
  createdAt: string;
}

export default function RenderTemplates() {
  const { projectId } = useParams();
  const {
    data: templates,
    isLoading,
    mutate,
  } = useSWR<TemplateInfo[]>(`/api/projects/${projectId}/render-templates`, swrFetcher);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<TemplateInfo | null>(null);

  const openCreate = useCallback(() => {
    setEditingTemplateId(null);
    setDialogOpen(true);
  }, []);

  const openEdit = useCallback((templateId: string) => {
    setEditingTemplateId(templateId);
    setDialogOpen(true);
  }, []);

  return (
    <SettingsSection>
      <SettingsSectionHeader
        title="Render templates"
        description="JSX templates used to visualize data in a custom way."
      />
      <Button variant="outline" icon="plus" className="w-fit" onClick={openCreate}>
        New template
      </Button>
      <SettingsTable
        isLoading={isLoading}
        isEmpty={isEmpty(templates)}
        emptyMessage="No render templates yet."
        headers={["Name", "Created", ""]}
        colSpan={3}
      >
        {templates?.map((template) => (
          <SettingsTableRow key={template.id}>
            <td className="px-4 text-sm font-medium">{template.name}</td>
            <td className="px-4 text-sm font-medium">{formatTimestamp(template.createdAt)}</td>
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

      <DeleteRenderTemplateDialog
        template={templateToDelete}
        onClose={() => setTemplateToDelete(null)}
        onDeleted={() => mutate()}
      />
    </SettingsSection>
  );
}
