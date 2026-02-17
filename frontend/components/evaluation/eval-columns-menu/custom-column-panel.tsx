import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { type CustomColumn, useEvalStore } from "@/components/evaluation/store";
import SQLEditor from "@/components/sql/sql-editor.tsx";
import type { SQLSchemaConfig } from "@/components/sql/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CustomColumnPanelProps {
  onBack: () => void;
  onSave: (column: CustomColumn) => void;
  editingColumn?: CustomColumn;
}

const EVAL_DATAPOINTS_SCHEMA: SQLSchemaConfig = { tables: ["evaluation_datapoints"] };

export const CustomColumnPanel = ({ onBack, onSave, editingColumn }: CustomColumnPanelProps) => {
  const { projectId, evaluationId } = useParams();
  const [name, setName] = useState(editingColumn?.name ?? "");
  const [sql, setSql] = useState(editingColumn?.sql ?? "");
  const [dataType, setDataType] = useState<"string" | "number">(editingColumn?.dataType ?? "string");
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  if (!projectId) return null;

  const handleSave = async () => {
    setError(null);

    const trimmedName = name.trim();
    const trimmedSql = sql.trim();

    if (!trimmedName || !trimmedSql) return;

    // Check for duplicate names (skip the current name when editing)
    const cols = useEvalStore.getState().columnDefs;
    if (
      cols.some((c) => c.meta?.isCustom && (c.header as string) === trimmedName && trimmedName !== editingColumn?.name)
    ) {
      setError(`A column named "${trimmedName}" already exists.`);
      return;
    }

    const normalizedSql = trimmedSql;

    // Test the query via the client-side API route
    setIsTesting(true);
    try {
      const testQuery = `SELECT ${normalizedSql} as \`test\` FROM evaluation_datapoints WHERE evaluation_id = {evaluationId:UUID} LIMIT 1`;
      const response = await fetch(`/api/projects/${projectId}/sql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: testQuery,
          parameters: { evaluationId: evaluationId as string },
        }),
      });

      if (!response.ok) {
        let errorMsg: string;
        try {
          const data = await response.json();
          errorMsg = data?.error ?? "Invalid SQL expression.";
        } catch {
          errorMsg = await response.text().catch(() => "Invalid SQL expression.");
        }
        throw new Error(errorMsg);
      }

      onSave({ name: trimmedName, sql: normalizedSql, dataType });
    } catch (e: any) {
      setError(e?.message || "Invalid SQL expression.");
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <motion.div
      key="form"
      initial={{ x: 20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 20, opacity: 0 }}
      transition={{ duration: 0.15 }}
    >
      <div className="w-md">
        <div className="px-3 py-2 border-b flex items-center">
          <Button variant="ghost" size="sm" className="p-0 h-auto hover:bg-transparent" onClick={onBack}>
            <ArrowLeft className="size-3.5 mr-1" />
            <span>Back</span>
          </Button>
        </div>
        <div className="p-3 grid gap-3">
          <div className="grid gap-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              autoFocus
              placeholder="e.g. Span Count"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Column SQL expression</Label>
              <a
                href="https://docs.laminar.sh/platform/sql-editor#table-schemas"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline"
              >
                schema docs
              </a>
            </div>
            <div className="h-28 flex flex-1 border rounded-md overflow-hidden">
              <SQLEditor
                value={sql}
                onChange={setSql}
                editable
                placeholder="e.g. arrayCount(x -> 1, trace_spans)"
                schema={EVAL_DATAPOINTS_SCHEMA}
                generationMode="eval-expression"
                inputPlaceholder="e.g. Count the number of spans in trace_spans"
                projectId={projectId as string}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {"Expression is added as a column: SELECT <expr> FROM evaluation_datapoints"}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label className="text-xs">Data type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as "string" | "number")}>
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {error && <p className="text-xs text-destructive break-words">{error}</p>}
          <Button className="w-full" onClick={handleSave} disabled={!name.trim() || !sql.trim() || isTesting}>
            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            {editingColumn ? "Save" : "Add"}
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
