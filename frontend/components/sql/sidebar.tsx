"use client";

import { isEmpty } from "lodash";
import { Edit, EllipsisVertical, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import React, { KeyboardEvent, memo, useCallback, useEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
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

const QueryItem = ({ template }: { template: SQLTemplate }) => {
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

    try {
      await mutate<SQLTemplate[]>(
        () => updateTemplate(projectId as string, { ...template, name: String(inputRef.current?.value) }),
        (currentData) => {
          if (!currentData) return [];
          return currentData.map((q) =>
            q.id === editTemplate.id ? { ...q, name: String(inputRef.current?.value) } : q
          );
        },
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    } finally {
      setEditTemplate(undefined);
    }
  }, [editTemplate, mutate, projectId, setEditTemplate, template, toast]);

  const handleDelete = useCallback(async () => {
    try {
      await mutate<SQLTemplate[]>(
        () => deleteTemplate(projectId as string, template.id),
        (currentData) => {
          if (!currentData) return [];

          return currentData.filter((q) => q.id !== template.id);
        },
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  }, [mutate, projectId, template.id, toast]);

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
      className={cn(
        "group flex items-center justify-between p-2 rounded-md hover:bg-accent cursor-pointer transition-colors ",
        {
          "bg-accent": selected,
        }
      )}
      onClick={handleQueryClick}
    >
      <div>
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
          <div className="text-sm font-medium truncate">{template.name}</div>
        )}
        <div className="text-xs text-muted-foreground">{new Date(template.createdAt).toLocaleDateString()}</div>
      </div>
      {!editing && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 focus-visible:ring-0"
            >
              <EllipsisVertical className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-32">
            <DropdownMenuItem
              onClick={() => {
                setEditTemplate(template);
              }}
              className="cursor-pointer"
            >
              <Edit className="h-3 w-3 mr-2" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleDelete} className="cursor-pointer text-destructive focus:text-destructive">
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

  const setCurrentTemplate = useSqlEditorStore((state) => state.setCurrentTemplate);

  useEffect(() => {
    if (id) {
      setCurrentTemplate(templates?.find((q) => q.id === id));
    } else {
      setCurrentTemplate(undefined);
    }
  }, [id, templates, setCurrentTemplate]);

  return (
    <div className="flex flex-col max-w-sm w-full">
      <div className="flex items-center p-2 px-4 border-b">
        <span className="font-medium text-lg">SQL Editor</span>
        <Badge className="ml-2" variant="outlinePrimary">
          Beta
        </Badge>
        <Link className="ml-auto" href={`/project/${projectId}/sql`}>
          <Button variant="outline" className="size-6 p-0 lg:flex">
            <Plus className="w-4 h-4" />
          </Button>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="p-2 rounded-md bg-muted animate-pulse">
                <div className="h-4 bg-muted-foreground/20 rounded mb-1"></div>
                <div className="h-3 bg-muted-foreground/20 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        ) : isEmpty(templates) ? (
          <div className="text-center text-sm">No queries created yet</div>
        ) : (
          <div className="space-y-2">
            {templates.map((template) => (
              <QueryItem key={template.id} template={template} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default memo(Sidebar);
