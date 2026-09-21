"use client";

import { ChevronDown, Copy } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/lib/hooks/use-toast";
import { type Span } from "@/lib/traces/types";

// Read-only stand-in for SpanActionsDropdown on public shared pages: same
// trigger, but every project-scoped action (SQL, playground, queues, datasets)
// is unavailable there, so only "Copy span ID" remains.
export default function SpanCopyIdDropdown({ span }: { span: Span }) {
  const { toast } = useToast();

  const handleCopySpanId = async () => {
    await navigator.clipboard.writeText(span.spanId);
    toast({ title: "Copied span ID", duration: 1000 });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          aria-label="Span actions"
          className="min-w-0 max-w-full justify-start gap-1 overflow-hidden px-1 text-base font-medium hover:bg-surface-up"
        >
          <span className="min-w-0 truncate">{span.name}</span>
          <ChevronDown className="size-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={handleCopySpanId}>
          <Copy className="size-3.5" />
          Copy span ID
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
