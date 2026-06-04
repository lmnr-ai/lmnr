import { ChevronDown, Eye, EyeOff, List, ListTree, type LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils.ts";

export type ViewTab = "tree" | "transcript";

const viewOptions: Record<ViewTab, { icon: LucideIcon; label: string }> = {
  tree: { icon: ListTree, label: "Tree" },
  transcript: { icon: List, label: "Transcript" },
};

const viewTabs: ViewTab[] = ["tree", "transcript"];

interface ViewToggleProps {
  tab: ViewTab;
  onTabChange: (tab: ViewTab) => void;
  showContent: boolean;
  onToggleContent: () => void;
}

/** Presentational Tree/Transcript dropdown + Content eye-toggle. Fully
 *  controlled — no store, no analytics. `ViewDropdown` wires it to the
 *  trace-view store; the session control bar wires it to per-trace state. */
export default function ViewToggle({ tab, onTabChange, showContent, onToggleContent }: ViewToggleProps) {
  const isValidTab = viewTabs.includes(tab);
  const displayTab: ViewTab = isValidTab ? tab : "transcript";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;
  const isTreeView = tab === "tree";

  return (
    <div className="flex items-center min-w-0">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center h-6 px-1.5 text-xs border rounded-md focus-visible:outline-0",
              isTreeView && "rounded-r-none border-r-0 outline-inset -outline-offset-1 hover:bg-secondary"
            )}
          >
            <CurrentIcon size={14} className="mr-1" />
            <span className="capitalize">{currentView.label}</span>
            <ChevronDown size={14} className="ml-1" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {viewTabs.map((option) => {
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
        <button
          onClick={onToggleContent}
          className={cn(
            "flex items-center h-6 px-1.5 text-xs border rounded-md rounded-l-none text-muted-foreground overflow-hidden",
            showContent ? "text-white hover:bg-muted" : "border-input hover:bg-secondary/50"
          )}
        >
          {showContent ? <Eye size={14} className="flex-shrink-0" /> : <EyeOff size={14} className="flex-shrink-0" />}
          <span className="ml-1 truncate">Content</span>
        </button>
      )}
    </div>
  );
}
