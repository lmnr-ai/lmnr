"use client";

import { Check, ChevronRight, Copy, Database, ExternalLink } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { v4 } from "uuid";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/hooks/use-toast";
import { cn } from "@/lib/utils";

interface QuerySQLCardProps {
  query: string;
}

export default function QuerySQLCard({ props }: { props: QuerySQLCardProps }) {
  const { query } = props;
  const { projectId } = useParams();
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const copyQuery = useCallback(async () => {
    await navigator.clipboard.writeText(query);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [query]);

  const openInEditor = useCallback(async () => {
    const id = v4();
    try {
      const res = await fetch(`/api/projects/${projectId}/sql/templates`, {
        method: "POST",
        body: JSON.stringify({ id, name: "Agent query", query }),
      });
      if (res.ok) {
        window.open(`/project/${projectId}/sql/${id}`, "_blank");
      }
    } catch {
      toast({ title: "Failed to open in SQL editor", variant: "destructive" });
    }
  }, [projectId, query]);

  return (
    <div className="rounded-lg border bg-muted/50 text-xs shadow-sm">
      <div className="flex items-center gap-2 px-3 py-2">
        <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        <button
          className="flex items-center gap-1 font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          Query SQL
          <ChevronRight className={cn("w-3.5 h-3.5 transition-transform duration-200", expanded && "rotate-90")} />
        </button>
        <div className="flex items-center gap-0.5 ml-auto">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={copyQuery} title="Copy SQL">
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={openInEditor} title="Open in SQL editor">
            <ExternalLink className="w-3 h-3" />
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="px-3 pb-2">
          <pre className="bg-background rounded p-2 overflow-x-auto text-[13px] text-foreground/80 font-mono whitespace-pre-wrap">
            {query}
          </pre>
        </div>
      )}
    </div>
  );
}
