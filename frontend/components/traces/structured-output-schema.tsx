import { Braces, ChevronDown } from "lucide-react";

import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import ContentRenderer from "../ui/content-renderer/index";

export const StructuredOutputSchema = ({ schema }: { schema: string }) => {
  if (!schema) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="focus:outline-hidden flex h-6 w-fit items-center border-tool bg-tool/10 gap-1 text-xs font-mono border rounded-md px-2 text-tool hover:bg-tool/20 transition-colors">
          <Braces size={12} className="min-w-3" />
          <span>output schema</span>
          <ChevronDown size={12} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-w-[600px] p-0" align="end" side="bottom">
        <ContentRenderer readOnly value={schema} defaultMode="json" className="max-h-[70vh]" />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
