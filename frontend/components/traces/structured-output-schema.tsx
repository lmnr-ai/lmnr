import { Braces, ChevronDown, ChevronRight } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import ContentRenderer from "../ui/content-renderer/index";

export const StructuredOutputSchema = ({ schema }: { schema: string }) => {
  if (!schema) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex h-6 w-fit items-center gap-1 rounded-md bg-tool/15 pl-2 pr-1.5 text-xs font-mono text-tool transition-colors outline-0 hover:bg-tool/25 data-[state=open]:bg-tool/35 [&[data-state=open]_.trigger-closed]:hidden [&:not([data-state=open])_.trigger-open]:hidden">
          <Braces size={12} className="min-w-3" />
          <span>output schema</span>
          <ChevronRight className="trigger-closed size-3" />
          <ChevronDown className="trigger-open size-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[600px] p-0" align="end" side="bottom">
        <ContentRenderer readOnly value={schema} defaultMode="json" className="max-h-[70vh]" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
