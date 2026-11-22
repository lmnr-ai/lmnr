"use client";

import { Loader2, Plus, X } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface AddRuleFormProps {
  onAdd: (substrings: string[]) => Promise<boolean>;
}

export default function AddRuleForm({ onAdd }: AddRuleFormProps) {
  const [phrases, setPhrases] = useState<string[] | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  if (!phrases) {
    return (
      <Button variant="outline" className="self-start" onClick={() => setPhrases([""])}>
        <Plus className="mr-1 size-3.5" />
        Add rule
      </Button>
    );
  }

  const filled = phrases.map((p) => p.trim()).filter(Boolean);

  const submit = async () => {
    setIsSaving(true);
    const added = await onAdd(filled);
    setIsSaving(false);
    if (added) setPhrases(null);
  };

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <span className="text-xs text-muted-foreground">Contains:</span>
      {phrases.map((phrase, i) => (
        <div key={i} className="flex items-center gap-1">
          <Input
            autoFocus={i === phrases.length - 1}
            className="font-mono text-xs"
            placeholder="you are a support assistant for"
            value={phrase}
            onChange={(e) => setPhrases(phrases.map((p, j) => (j === i ? e.target.value : p)))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filled.length > 0 && !isSaving) submit();
              if (e.key === "Escape") setPhrases(null);
            }}
          />
          {phrases.length > 1 && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => setPhrases(phrases.filter((_, j) => j !== i))}
              aria-label="Remove phrase"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <Button variant="ghost" className="text-muted-foreground" onClick={() => setPhrases([...phrases, ""])}>
          <Plus className="mr-1 size-3.5" />
          And phrase
        </Button>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => setPhrases(null)}>
            Cancel
          </Button>
          <Button disabled={filled.length === 0 || isSaving} onClick={submit}>
            {isSaving && <Loader2 className="mr-1 size-3.5 animate-spin" />}
            Add
          </Button>
        </div>
      </div>
    </div>
  );
}
