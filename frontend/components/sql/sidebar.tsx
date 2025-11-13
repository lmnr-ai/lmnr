"use client";

import { isEmpty } from "lodash";
import { Edit, EllipsisVertical, FileText, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";
import { v4 } from "uuid";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

import { SQLTemplate, useSqlEditorStore } from "./sql-editor-store";

const updateTemplate = async (projectId: string, template: SQLTemplate) => {
  await fetch(`/api/projects/${projectId}/sql/templates/${template.id}`, {
    method: "PUT",
    body: JSON.stringify(template),
  });
};

const deleteTemplate = async (projectId: string, id: string) => {
  await fetch(`/api/projects/${projectId}/sql/templates/${id}`, {
    method: "DELETE",
  });
};

const QueryItem = ({ handleDelete, template }: { template: SQLTemplate; handleDelete: () => void }) => {
  const { id, projectId } = useParams();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  const { editTemplate, setEditTemplate } = useSqlEditorStore((state) => ({
    editTemplate: state.editTemplate,
    setEditTemplate: state.setEditTemplate,
  }));

  const inputRef = useRef<HTMLInputElement>(null);

  const { editing, selected } = useMemo(
    () => ({
      editing: editTemplate?.id === template.id,
      selected: id === template.id,
    }),
    [editTemplate?.id, id, template.id]
  );

  const handleQueryClick = () => {
    router.push(`/project/${projectId}/sql/${template.id}`);
  };

  const handleEdit = useCallback(async () => {
    if (!editTemplate) return;

    const newName = String(inputRef.current?.value);

    try {
      await mutate<SQLTemplate[]>(
        `/api/projects/${projectId}/sql/templates`,
        async (currentData) => {
          await updateTemplate(projectId as string, { ...template, name: newName });

          if (!currentData) return [];
          return currentData.map((q) => (q.id === editTemplate.id ? { ...q, name: newName } : q));
        },
        { rollbackOnError: true, revalidate: false, populateCache: true }
      );
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    } finally {
      setEditTemplate(undefined);
    }
  }, [editTemplate, mutate, projectId, setEditTemplate, template, toast]);

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        setEditTemplate(undefined);
      } else if (e.key === "Enter") {
        await handleEdit();
      }
    },
    [handleEdit, setEditTemplate]
  );

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current?.focus();
    }
  }, [editing]);

  return (
    <div
      className={cn("group flex items-center px-2 py-1 rounded-md hover:bg-accent cursor-pointer transition-colors", {
        "bg-accent": selected,
      })}
      onClick={handleQueryClick}
    >
      {editing ? (
        <Input
          ref={inputRef}
          defaultValue={editTemplate?.name}
          onBlur={handleEdit}
          onKeyDown={handleKeyDown}
          className="w-full bg-transparent border-token-border-light p-0 h-fit"
          type="text"
          onClick={(e) => e.preventDefault()}
        />
      ) : (
        <>
          <FileText className="min-w-4 min-h-4 w-4 h-4 mr-2 text-secondary-foreground" />
          <span title={template.name} className="text-sm font-medium truncate">
            {template.name}
          </span>
        </>
      )}
      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 ml-auto focus-visible:ring-0"
              onClick={(e) => e.stopPropagation()}
            >
              <EllipsisVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                setEditTemplate(template);
              }}
              className="cursor-pointer"
            >
              <Edit className="h-3 w-3 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={(e) => {
                e.stopPropagation();
                handleDelete();
              }}
              className="cursor-pointer text-destructive focus:text-destructive"
            >
              <Trash2 className="h-3 w-3 mr-2" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
};

const Sidebar = ({ templates, isLoading }: { templates: SQLTemplate[]; isLoading: boolean }) => {
  const { projectId, id } = useParams();
  const { mutate } = useSWRConfig();
  const router = useRouter();
  const { toast } = useToast();

  const setCurrentTemplate = useSqlEditorStore((state) => state.setCurrentTemplate);

  const handleCreate = useCallback(async () => {
    const optimisticData: SQLTemplate = {
      id: v4(),
      name: "Untitled Query",
      query: "",
      createdAt: new Date().toISOString(),
      projectId: projectId as string,
    };

    await mutate<SQLTemplate[]>(
      `/api/projects/${projectId}/sql/templates`,
      (currentData = []) => [optimisticData, ...currentData],
      {
        revalidate: false,
      }
    );

    router.push(`/project/${projectId}/sql/${optimisticData.id}`);

    await fetch(`/api/projects/${projectId}/sql/templates`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        id: optimisticData.id,
        name: `Untitled Query`,
        query: optimisticData.query,
      }),
    });
  }, [mutate, projectId, router]);

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

        setCurrentTemplate(undefined);
      } catch (e) {
        if (e instanceof Error) {
          toast({ variant: "destructive", title: "Error", description: e.message });
        }
      }
    },
    [mutate, projectId, router, setCurrentTemplate, toast]
  );

  useEffect(() => {
    if (id) {
      setCurrentTemplate(templates?.find((q) => q.id === id));
    }
  }, [id, templates, setCurrentTemplate]);

  return (
    <div className="flex flex-col max-w-60 w-full h-full rounded border bg-sidebar">
      <div className="flex items-center p-2 px-4 border-b shrink-0">
        <span className="font-medium">Queries</span>
        <Link className="ml-auto" href={`/project/${projectId}/sql`}>
          <Button onClick={handleCreate} variant="outline" className="size-6 p-0 lg:flex">
            <Plus className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      <ScrollArea className="flex-1 p-2 [&>*>div]:block!">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex h-8 rounded-md bg-muted animate-pulse" />
            ))}
          </div>
        ) : isEmpty(templates) ? (
          <div className="text-center text-sm text-secondary-foreground">No queries created yet</div>
        ) : (
          <div className="flex flex-col gap-2 max-h-0">
            {templates.map((template) => (
              <QueryItem handleDelete={() => handleDelete(template)} key={template.id} template={template} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};

export default memo(Sidebar);
