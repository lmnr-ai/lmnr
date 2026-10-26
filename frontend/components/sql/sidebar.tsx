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

  const { selectTemplate, discardQuerySave } = useSqlEditorStore((state) => ({
    selectTemplate: state.selectTemplate,
    discardQuerySave: state.discardQuerySave,
  }));

  const handleDelete = useCallback(
    async (template: SQLTemplate) => {
      // The row is about to stop existing, so drop its autosave — queued and in flight. Either one
      // would PUT a deleted id, fail, and toast a save error for a query the user just removed.
      discardQuerySave(template.id);

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
    [discardQuerySave, mutate, projectId, router, toast]
  );

  // Route is the source of truth for which query is open. `selectTemplate` keeps unsaved keystrokes
  // when the list merely revalidates, and flushes pending saves when the selection actually changes.
  useEffect(() => {
    selectTemplate(id ? templates?.find((q) => q.id === id) : undefined);
  }, [id, templates, selectTemplate]);

  // No surface of its own: the list is navigation, so it sits on the page plane and lets the
  // editor card to its right carry the only elevation on the screen.
  return (
    <div className="flex w-60 shrink-0 flex-col">
      <div className="flex h-12 shrink-0 items-center px-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Queries</span>
        <Button
          aria-label="New query"
          onClick={createTemplate}
          variant="ghost"
          className="ml-auto size-7 p-0 hover:bg-surface-up-2"
        >
          <Plus className="size-4" />
        </Button>
      </div>

      <ScrollArea className="flex-1 [&>*>div]:block!">
        <div className="flex flex-col gap-0.5 pb-1.5">
          {isLoading ? (
            [1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse rounded-lg bg-surface-up" />)
          ) : isEmpty(templates) ? (
            <span className="px-2 py-6 text-center text-xs text-muted-foreground">No queries yet</span>
          ) : (
            templates.map((template) => (
              <QueryItem handleDelete={() => handleDelete(template)} key={template.id} template={template} />
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  );
};

export default memo(Sidebar);
