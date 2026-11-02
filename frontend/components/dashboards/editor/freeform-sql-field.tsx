"use client";

import { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { Play } from "lucide-react";
import { useRef } from "react";

import { useDashboardEditorStoreContext } from "@/components/dashboards/editor/dashboard-editor-store";
import SQLEditor from "@/components/sql/sql-editor";
import SqlEditorMenu from "@/components/sql/sql-editor-menu";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface FreeformSqlFieldProps {
  onRun: () => void;
  canRun: boolean;
  issue: string | null;
}

export default function FreeformSqlField({ onRun, canRun, issue }: FreeformSqlFieldProps) {
  const { query, setQuery, isLoading } = useDashboardEditorStoreContext((state) => ({
    query: state.chart.query,
    setQuery: state.setQuery,
    isLoading: state.isLoading,
  }));
  const editorRef = useRef<ReactCodeMirrorRef>(null);

  return (
    <div className="grid gap-1">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-semibold">SQL</Label>
        <SqlEditorMenu query={query} editorRef={editorRef} />
      </div>
      <div className="relative h-72 overflow-hidden rounded border bg-background [&_.cm-scroller]:scrollbar-thin">
        <SQLEditor value={query} onChange={setQuery} editable formattable editorRef={editorRef} lineNumbers={false} />
        <Button
          className="absolute bottom-2 right-2 z-10 gap-1 shadow-md"
          onClick={onRun}
          disabled={isLoading || !canRun}
        >
          <Play className="size-3.5" />
          Run
        </Button>
      </div>
      {issue && <p className="text-xs text-amber-500">{issue}</p>}
    </div>
  );
}
