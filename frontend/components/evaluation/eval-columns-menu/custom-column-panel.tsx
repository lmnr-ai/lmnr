import CodeMirror from "@uiw/react-codemirror";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { type CustomColumn, useEvalStore } from "@/components/evaluation/store";
import { extensions, theme } from "@/components/sql/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface CustomColumnPanelProps {
  onBack: () => void;
  onAdd: (column: CustomColumn) => void;
}

export const CustomColumnPanel = ({ onBack, onAdd }: CustomColumnPanelProps) => {
  const { projectId, evaluationId } = useParams();
  const [name, setName] = useState("");
  const [sql, setSql] = useState("");
  const [dataType, setDataType] = useState<"string" | "number">("string");
  const [error, setError] = useState<string | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleAdd = async () => {
    setError(null);

    const trimmedName = name.trim();
    const trimmedSql = sql.trim();

    if (!trimmedName || !trimmedSql) return;

    // Check for duplicate names
    const existingColumns = useEvalStore.getState().customColumns;
    if (existingColumns.some((cc) => cc.name === trimmedName)) {
      setError(`A column named "${trimmedName}" already exists.`);
      return;
    }

    const normalizedSql = trimmedSql.replace(/\btraces\./g, "t.").replace(/\bevaluation_datapoints\./g, "dp.");

    // Test the query via the client-side API route
    setIsTesting(true);
    try {
      const testQuery = `SELECT ${normalizedSql} as \`test\` FROM evaluation_datapoints dp JOIN traces t ON t.id = dp.trace_id WHERE dp.evaluation_id = {evaluationId:UUID} LIMIT 1`;
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

      onAdd({ name: trimmedName, sql: normalizedSql, dataType });
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
      <div className="w-[380px]">
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
              placeholder="e.g. Input Cost"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">SQL expression</Label>
              <a
                href="https://docs.laminar.sh/platform/sql-editor#table-schemas"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground underline"
              >
                schema docs
              </a>
            </div>
            <div className="h-[80px] border rounded-md overflow-hidden">
              <CodeMirror
                placeholder="e.g. t.input_cost"
                theme={theme}
                className="size-full"
                extensions={extensions}
                value={sql}
                onChange={setSql}
              />
            </div>
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
          <Button className="w-full" onClick={handleAdd} disabled={!name.trim() || !sql.trim() || isTesting}>
            {isTesting ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : null}
            Add
          </Button>
        </div>
      </div>
    </motion.div>
  );
};
