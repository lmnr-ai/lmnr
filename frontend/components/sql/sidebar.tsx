"use client";

import { isEmpty } from "lodash";
import { Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { memo, useCallback, useEffect } from "react";
import { useSWRConfig } from "swr";

import QueryItem from "@/components/sql/query-item";
import { type SQLTemplate, useSqlEditorStore } from "@/components/sql/sql-editor-store";
import { useCreateTemplate } from "@/components/sql/use-create-template";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ElevatedSurface } from "@/components/ui/surface";
import { useToast } from "@/lib/hooks/use-toast";

const deleteTemplate = async (projectId: string, id: string) => {
  const res = await fetch(`/api/projects/${projectId}/sql/templates/${id}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to delete template");
  }
};

const Sidebar = ({ templates, isLoading }: { templates: SQLTemplate[]; isLoading: boolean }) => {
  const { projectId, id } = useParams();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const { toast } = useToast();
  const createTemplate = useCreateTemplate();

  const selectTemplate = useSqlEditorStore((state) => state.selectTemplate);

  const handleDelete = useCallback(
    async (template: SQLTemplate) => {
      try {
        router.push(`/project/${projectId}/sql`);

        await mutate<SQLTemplate[]>(
          `/api/projects/${projectId}/sql/templates`,
          async (currentData = []) => {
            await deleteTemplate(projectId as string, template.id);

            return currentData.filter((q) => q.id !== template.id);
          },
          { revalidate: false, populateCache: true, rollbackOnError: true }
        );
      } catch (e) {
        if (e instanceof Error) {
          toast({ variant: "destructive", title: "Error", description: e.message });
        }
      }
    },
    [mutate, projectId, router, toast]
  );

  // Route is the source of truth for which query is open. `selectTemplate` keeps unsaved keystrokes
  // when the list merely revalidates, and flushes pending saves when the selection actually changes.
  useEffect(() => {
    selectTemplate(id ? templates?.find((q) => q.id === id) : undefined);
  }, [id, templates, selectTemplate]);

  return (
    <ElevatedSurface className="flex w-60 shrink-0 flex-col overflow-hidden rounded-xl border">
      <div className="flex h-10 shrink-0 items-center border-b px-3">
        <span className="text-sm font-medium">Queries</span>
        <Button
          aria-label="New query"
          onClick={createTemplate}
          variant="ghost"
          className="ml-auto size-6 p-0 hover:bg-surface-up-2"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 [&>*>div]:block!">
        <div className="flex flex-col gap-0.5 p-1.5">
          {isLoading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-up-2" />)
          ) : isEmpty(templates) ? (
            <span className="px-2 py-6 text-center text-xs text-muted-foreground">No queries yet</span>
          ) : (
            templates.map((template) => (
              <QueryItem handleDelete={() => handleDelete(template)} key={template.id} template={template} />
            ))
          )}
        </div>
      </ScrollArea>
    </ElevatedSurface>
  );
};

export default memo(Sidebar);
