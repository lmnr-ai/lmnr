import { X } from "lucide-react";
import { type PropsWithChildren } from "react";

import { Button } from "@/components/ui/button";

interface PanelWrapperProps {
  title: string;
  onClose: () => void;
}

export default function PanelWrapper({ title, onClose, children }: PropsWithChildren<PanelWrapperProps>) {
  return (
    <div className="flex flex-col w-[25vw] min-w-[320px] h-full min-h-[50vh] max-h-full bg-background border rounded-lg shadow-lg overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b flex-shrink-0">
        <span className="text-sm font-medium truncate">{title}</span>
        <Button variant="ghost" size="icon" className="size-6 flex-shrink-0" onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
