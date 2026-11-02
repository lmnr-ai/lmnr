import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { useDashboardPreviewsStore } from "./previews-store";

/** The current dashboard's name; clicking it shows or hides the previews strip. */
const PreviewsToggle = ({ name }: { name: string }) => {
  const { isOpen, toggle } = useDashboardPreviewsStore((s) => ({ isOpen: s.isOpen, toggle: s.toggle }));
  const Chevrons = isOpen ? ChevronsDownUp : ChevronsUpDown;

  return (
    <Button
      variant="ghost"
      aria-pressed={isOpen}
      onClick={toggle}
      className={cn(
        "h-7 max-w-64 gap-1 px-2 text-base font-medium hover:bg-emphasis-1 active:bg-emphasis-2",
        isOpen && "bg-emphasis-2 hover:bg-emphasis-2"
      )}
    >
      <span title={name} className="truncate">
        {name}
      </span>
      <Chevrons className="size-3.5 shrink-0 text-muted-foreground" />
    </Button>
  );
};

export default PreviewsToggle;
