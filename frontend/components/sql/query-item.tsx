"use client";

import { EllipsisVertical, FileText, Pencil, Trash2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { type KeyboardEvent, useCallback, useEffect, useRef } from "react";
import { useSWRConfig } from "swr";

import { type SQLTemplate, useSqlEditorStore } from "@/components/sql/sql-editor-store";
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

const renameTemplate = async (projectId: string, templateId: string, name: string) => {
  const res = await fetch(`/api/projects/${projectId}/sql/templates/${templateId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    // The name only. The editor's autosave owns `query`; sending the copy this row holds is what
    // used to overwrite SQL typed moments earlier.
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const errMessage = await res
      .json()
      .then((d) => d?.error)
      .catch(() => null);
    throw new Error(errMessage ?? "Failed to rename query");
  }
};

const QueryItem = ({ handleDelete, template }: { template: SQLTemplate; handleDelete: () => void }) => {
  const { id, projectId } = useParams();
  const router = useRouter();
  const { mutate } = useSWRConfig();
  const { toast } = useToast();

  const { editTemplate, setEditTemplate, flushQuerySave } = useSqlEditorStore((state) => ({
    editTemplate: state.editTemplate,
    setEditTemplate: state.setEditTemplate,
    flushQuerySave: state.flushQuerySave,
  }));

  const inputRef = useRef<HTMLInputElement>(null);
  // Enter and the blur it causes both submit; this keeps the rename to one PUT per edit session.
  const submittedRef = useRef(false);

  const editing = editTemplate?.id === template.id;
  const selected = id === template.id;

  const handleEdit = useCallback(async () => {
    if (!editing || submittedRef.current) return;
    submittedRef.current = true;

    const name = inputRef.current?.value.trim();
    setEditTemplate(undefined);
    if (!name || name === template.name) return;

    try {
      // Land the queued query first: renaming repopulates this row from the list cache, so the
      // query it carries has to be the one already on the server.
      await flushQuerySave();

      await mutate<SQLTemplate[]>(
        `/api/projects/${projectId}/sql/templates`,
        async (currentData) => {
          await renameTemplate(projectId as string, template.id, name);

          if (!currentData) return [];
          return currentData.map((q) => (q.id === template.id ? { ...q, name } : q));
        },
        { rollbackOnError: true, revalidate: false, populateCache: true }
      );
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  }, [editing, flushQuerySave, mutate, projectId, setEditTemplate, template.id, template.name, toast]);

  const handleKeyDown = useCallback(
    async (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        submittedRef.current = true;
        setEditTemplate(undefined);
      } else if (e.key === "Enter") {
        await handleEdit();
      }
    },
    [handleEdit, setEditTemplate]
  );

  useEffect(() => {
    if (editing) {
      submittedRef.current = false;
      inputRef.current?.focus();
    }
  }, [editing]);

  return (
    <div
      className={cn(
        "group flex h-8 cursor-pointer items-center rounded-lg px-2 transition-colors hover:bg-surface-up-2",
        selected && "bg-surface-up-2"
      )}
      onClick={() => router.push(`/project/${projectId}/sql/${template.id}`)}
    >
      {editing ? (
        <Input
          ref={inputRef}
          defaultValue={template.name}
          onBlur={handleEdit}
          onKeyDown={handleKeyDown}
          className="h-fit w-full border-token-border-light bg-transparent py-px text-sm!"
          type="text"
          onClick={(e) => e.preventDefault()}
        />
      ) : (
        <>
          <FileText className="mr-2 size-3.5 shrink-0 text-muted-foreground" />
          <span title={template.name} className="truncate text-sm">
            {template.name}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                aria-label="More options"
                variant="ghost"
                size="sm"
                className="ml-auto size-6 min-w-6 p-0 opacity-0 hover:bg-surface-up-3 focus-visible:ring-0 group-hover:opacity-100"
                onClick={(e) => e.stopPropagation()}
              >
                <EllipsisVertical className="size-3" />
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
                <Pencil className="size-3.5 text-inherit" />
                <span>Rename</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className="cursor-pointer text-destructive focus:text-destructive"
              >
                <Trash2 className="size-3.5 text-inherit" />
                <span>Delete</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </>
      )}
    </div>
  );
};

export default QueryItem;
