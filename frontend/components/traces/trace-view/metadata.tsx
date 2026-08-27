"use client";

import { FileText } from "lucide-react";
import { useState } from "react";

import { HeaderIconButton } from "@/components/traces/trace-view/header/header-icon-button";
import ContentRenderer from "@/components/ui/content-renderer/index";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover.tsx";
import { cn } from "@/lib/utils.ts";

interface MetadataProps {
  metadata?: string;
}

const Metadata = ({ metadata }: MetadataProps) => {
  const [open, setOpen] = useState(false);

  if (!metadata) {
    return null;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <HeaderIconButton
          icon={<FileText className={cn({ "text-primary": open })} size={14} />}
          label="Metadata"
          active={open}
        />
      </PopoverTrigger>
      <PopoverContent className="p-0 overflow-hidden">
        <ContentRenderer
          value={metadata}
          readOnly={true}
          defaultMode="json"
          className="max-h-[50vh] border-none bg-muted/30"
          placeholder=""
        />
      </PopoverContent>
    </Popover>
  );
};

export default Metadata;
