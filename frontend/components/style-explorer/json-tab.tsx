"use client";

// TEMPORARY style exploration tooling — safe to delete this folder + the mount in layout.tsx.
// Copy current state as JSON; paste + Apply to load and re-theme. Invalid JSON toasts, no crash.

import { Check, Copy, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/lib/hooks/use-toast";

import { useStyleContext } from "./style-context";

export default function JsonTab() {
  const { toJSON, fromJSON, resetAll } = useStyleContext();
  const [draft, setDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(toJSON());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      toast({ title: "Copied JSON to clipboard" });
    } catch {
      toast({ variant: "destructive", title: "Failed to copy" });
    }
  };

  const handleApply = () => {
    try {
      fromJSON(draft);
      toast({ title: "Applied JSON theme" });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Invalid JSON",
        description: err instanceof Error ? err.message : "Could not parse input",
      });
    }
  };

  const handleReset = () => {
    resetAll();
    setDraft("");
    toast({ title: "Wiped saved state — reset to defaults" });
  };

  return (
    <div className="flex flex-col gap-3">
      <Button variant="outline" size="md" onClick={handleCopy} className="w-full">
        {copied ? <Check className="mr-1 size-3.5" /> : <Copy className="mr-1 size-3.5" />}
        Copy JSON
      </Button>
      <Textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Paste theme JSON here…"
        className="h-48 font-mono text-xs"
      />
      <Button variant="default" size="md" onClick={handleApply} disabled={!draft.trim()} className="w-full">
        Apply
      </Button>
      <div className="h-px w-full bg-border" />
      <Button variant="destructive" size="md" onClick={handleReset} className="w-full">
        <Trash2 className="mr-1 size-3.5" />
        Wipe saved state (reset)
      </Button>
    </div>
  );
}
