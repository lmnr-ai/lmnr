"use client";

import { json } from "@codemirror/lang-json";
import { EditorView } from "@codemirror/view";
import CodeMirror from "@uiw/react-codemirror";
import { Loader2 } from "lucide-react";

import { type SchemaField } from "@/components/signals/utils";
import { theme } from "@/components/ui/content-renderer/utils";

import PayloadValue from "./payload-value";

export default function TestResultsView({
  output,
  isExecuting,
  schemaFields,
}: {
  output: string;
  isExecuting: boolean;
  schemaFields: SchemaField[];
}) {
  if (isExecuting) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 gap-2 py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Testing signal... this may take some time.</span>
      </div>
    );
  }

  if (!output) return null;

  const validFields = schemaFields.filter((f) => f.name.trim());
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(output);
  } catch {
    parsed = null;
  }

  if (parsed && typeof parsed === "object" && validFields.length > 0) {
    return (
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {validFields.map((field) => (
          <div key={field.name} className="rounded-md border bg-secondary/50 px-3 py-2">
            <div className="text-xs text-muted-foreground mb-1">{field.name}</div>
            <div className="text-sm">
              <PayloadValue value={(parsed as Record<string, unknown>)[field.name]} field={field} />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-auto p-3">
      <div className="border rounded-md bg-muted/50 overflow-hidden">
        <CodeMirror readOnly value={output} extensions={[json(), EditorView.lineWrapping]} theme={theme} />
      </div>
    </div>
  );
}
