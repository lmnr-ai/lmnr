"use client";

import { Plus, SquareTerminal } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useCallback, useEffect } from "react";

import SaveStatusIndicator from "@/components/sql/save-status-indicator";
import SQLEditor from "@/components/sql/sql-editor";
import { useSqlEditorStore } from "@/components/sql/sql-editor-store";
import { useCreateTemplate } from "@/components/sql/use-create-template";
import { Button } from "@/components/ui/button";
import { ElevatedSurface } from "@/components/ui/surface";

interface TemplateEditorProps {
  /** Run / export controls, rendered in the editor header next to the query name. */
  actions?: ReactNode;
}

const TemplateEditor = ({ actions }: TemplateEditorProps) => {
  const { projectId } = useParams();
  const createTemplate = useCreateTemplate();

  const { template, saveStatus, setQuery, flushQuerySave } = useSqlEditorStore((state) => ({
    template: state.currentTemplate,
    saveStatus: state.saveStatus,
    setQuery: state.setQuery,
    flushQuerySave: state.flushQuerySave,
  }));

  const handleQueryChange = useCallback((query: string) => setQuery(projectId as string, query), [projectId, setQuery]);

  // A debounced save can still be pending when the tab is hidden, the page goes away or the editor
  // unmounts, so every one of those paths flushes it. `keepalive` lets the request outlive the page.
  useEffect(() => {
    const flushOnHide = () => {
      if (document.visibilityState === "hidden") void flushQuerySave({ keepalive: true });
    };
    const flushOnPageHide = () => void flushQuerySave({ keepalive: true });

    document.addEventListener("visibilitychange", flushOnHide);
    window.addEventListener("pagehide", flushOnPageHide);

    return () => {
      document.removeEventListener("visibilitychange", flushOnHide);
      window.removeEventListener("pagehide", flushOnPageHide);
      void flushQuerySave({ keepalive: true });
    };
  }, [flushQuerySave]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
        <SquareTerminal className="size-4 shrink-0 text-muted-foreground" />
        <span title={template?.name} className="truncate text-sm font-medium">
          {template?.name ?? "Query"}
        </span>
        {template && <SaveStatusIndicator status={saveStatus} />}
        {actions && <div className="ml-auto flex items-center gap-2 pl-2">{actions}</div>}
      </div>

      {template ? (
        <div className="flex min-h-0 flex-1 overflow-auto">
          <SQLEditor
            value={template.query ?? ""}
            onChange={handleQueryChange}
            editable
            autoFocus
            projectId={projectId as string}
            aiButtonVariant="full"
          />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 items-center justify-center p-6">
          <div className="flex max-w-sm flex-col items-center gap-3 text-center">
            <ElevatedSurface className="flex size-9 items-center justify-center rounded-xl border">
              <SquareTerminal className="size-4 text-muted-foreground" />
            </ElevatedSurface>
            <div className="flex flex-col gap-1">
              <span className="text-sm font-medium">No query selected</span>
              <span className="text-xs text-muted-foreground">
                Create a query or pick one from the list to explore your traces with SQL.
              </span>
            </div>
            <Button onClick={createTemplate} variant="outline" size="sm">
              <Plus data-icon="inline-start" className="size-3.5" />
              New query
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default TemplateEditor;
