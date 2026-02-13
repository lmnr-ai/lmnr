import { useState } from "react";

import { type CustomColumn } from "@/components/evaluation/store";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AddCustomColumnDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (column: CustomColumn) => void;
}

export default function AddCustomColumnDialog({ open, onOpenChange, onAdd }: AddCustomColumnDialogProps) {
  const [name, setName] = useState("");
  const [sql, setSql] = useState("");
  const [dataType, setDataType] = useState<"string" | "number">("string");

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
    if (!open) {
      setName("");
      setSql("");
      setDataType("string");
    }
  };

  const handleSubmit = () => {
    const normalizedSql = sql.replace(/\btraces\./g, "t.").replace(/\bevaluation_datapoints\./g, "dp.");
    onAdd({ name, sql: normalizedSql, dataType });
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-96">
        <DialogHeader>
          <DialogTitle>Add SQL column</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label>Name</Label>
            <Input autoFocus placeholder="e.g. Input Cost" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label>SQL expression</Label>
            <Input placeholder="e.g. traces.input_cost" value={sql} onChange={(e) => setSql(e.target.value)} />
            <p className="text-xs text-muted-foreground">
              <a
                href="https://docs.laminar.sh/platform/sql-editor#table-schemas"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View table schemas
              </a>
            </p>
          </div>
          <div className="grid gap-2">
            <Label>Data type</Label>
            <Select value={dataType} onValueChange={(v) => setDataType(v as "string" | "number")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button className="w-fit" onClick={handleSubmit} disabled={!name.trim() || !sql.trim()} handleEnter>
            Add
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
