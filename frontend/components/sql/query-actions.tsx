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

/** Run / cancel plus the export menu, shown in the query card header. */
const QueryActions = ({ query, templateId, results, isLoading, onRun, onCancel }: QueryActionsProps) => {
  const hasQuery = Boolean(query.trim());

  return (
    <>
      {isLoading ? (
        <Button size="sm" variant="outline" onClick={onCancel}>
          <Square data-icon="inline-start" className="size-3" fill="currentColor" />
          Cancel
        </Button>
      ) : (
        <Button size="sm" disabled={!hasQuery} onClick={onRun}>
          <PlayIcon data-icon="inline-start" className="size-3" />
          Run
          <span className="ml-1 text-xs opacity-75">⌘ + ⏎</span>
        </Button>
      )}
      <ExportSqlDialog results={results} sqlQuery={query} sqlTemplateId={templateId}>
        <Button size="sm" variant="outline" disabled={!hasQuery}>
          <Database data-icon="inline-start" className="size-3.5" />
          Export
          <ChevronDown data-icon="inline-end" className="size-3.5" />
        </Button>
      </ExportSqlDialog>
    </>
  );
};

export default QueryActions;
