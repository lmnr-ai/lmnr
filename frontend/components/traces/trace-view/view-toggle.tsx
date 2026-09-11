import { ChevronDown, Eye, EyeOff, LayoutTemplate, List, ListTree, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils.ts";

export type ViewTab = "tree" | "transcript" | "custom";

const viewOptions: Record<ViewTab, { icon: LucideIcon; label: string }> = {
  tree: { icon: ListTree, label: "Tree" },
  transcript: { icon: List, label: "Transcript" },
  custom: { icon: LayoutTemplate, label: "Custom" },
};

const defaultViewTabs: ViewTab[] = ["tree", "transcript"];

interface ViewToggleProps {
  tab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  showContent: boolean;
  onToggleContent: () => void;
  /** Tabs offered in the dropdown. Session surfaces keep the tree/transcript
   *  default; the trace view adds "custom" (template-rendered trace). */
  tabs?: ViewTab[];
}

/** Presentational Tree/Transcript/Custom dropdown + Content eye-toggle. Fully
 *  controlled — no store, no analytics. `ViewDropdown` wires it to the
 *  trace-view store; the session control bar wires it to per-trace state. */
export default function ViewToggle({
  tab,
  onTabChange,
  showContent,
  onToggleContent,
  tabs = defaultViewTabs,
}: ViewToggleProps) {
  const isValidTab = tabs.includes(tab);
  const displayTab: ViewTab = isValidTab ? tab : "transcript";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;
  const isTreeView = tab === "tree";

  return (
    <div className="flex items-center min-w-0 gap-px bg-surface-00">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "flex h-[26px] items-center bg-surface-up-2 hover:bg-surface-up-4 active:bg-surface-up-5 data-[state=open]:bg-surface-up-5",
              isTreeView && "rounded-r-none"
            )}
          >
            <CurrentIcon size={14} className="mr-1" />
            <span className="capitalize">{currentView.label}</span>
            <ChevronDown size={14} className="ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {tabs.map((option) => {
            const view = viewOptions[option];
            const OptionIcon = view.icon;
            return (
              <DropdownMenuItem
                key={option}
                onClick={() => onTabChange(option)}
                className={cn(tab === option && "bg-accent")}
              >
                <OptionIcon size={14} />
                {view.label}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Content toggle (only visible in tree view) */}
      {isTreeView && (
        <Button
          variant="ghost"
          onClick={onToggleContent}
          className={cn(
            "flex h-[26px] items-center overflow-hidden rounded-l-none bg-surface-up-2 px-1.5 text-muted-foreground hover:bg-surface-up-4 active:bg-surface-up-5",
            showContent && "text-foreground"
          )}
        >
          {showContent ? <Eye size={14} className="flex-shrink-0" /> : <EyeOff size={14} className="flex-shrink-0" />}
          <span className="ml-1 truncate">Content</span>
        </Button>
      )}
    </div>
  );
}
