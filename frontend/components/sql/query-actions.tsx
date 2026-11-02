"use client";

import { ChevronDown, Database, PlayIcon, Square } from "lucide-react";

import ExportSqlDialog from "@/components/sql/export-sql-dialog";
import { Button } from "@/components/ui/button";

interface QueryActionsProps {
  query: string;
  templateId?: string;
  results: Record<string, any>[] | null;
  isLoading: boolean;
  onRun: () => void;
  onCancel: () => void;
}

/** Run / cancel plus the export menu, shown in the editor header. */
const QueryActions = ({ query, templateId, results, isLoading, onRun, onCancel }: QueryActionsProps) => {
  const hasQuery = Boolean(query.trim());

  return (
    <>
      {isLoading ? (
        <Button variant="outline" className="gap-2" onClick={onCancel}>
          <Square data-icon="inline-start" className="size-3.5" fill="currentColor" />
          Cancel
        </Button>
      ) : (
        <Button className="gap-2" disabled={!hasQuery} onClick={onRun}>
          <PlayIcon data-icon="inline-start" className="size-3.5" />
          Run
          <span className="text-[11px] opacity-70">⌘ + ⏎</span>
        </Button>
      )}
      <ExportSqlDialog results={results} sqlQuery={query} sqlTemplateId={templateId}>
        <Button variant="outline" className="gap-2" disabled={!hasQuery}>
          <Database data-icon="inline-start" className="size-3.5" />
          Export
          <ChevronDown data-icon="inline-end" className="size-3.5 opacity-70" />
        </Button>
      </ExportSqlDialog>
    </>
  );
};

export default QueryActions;
