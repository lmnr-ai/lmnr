import { ChevronDown, Eye, EyeOff, List, ListTree, type LucideIcon } from "lucide-react";

import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import TranscriptHintPopover from "@/components/traces/trace-view/transcript-hint-popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { track } from "@/lib/posthog";
import { cn } from "@/lib/utils.ts";

type ViewTab = "tree" | "transcript";

const viewOptions: Record<
  ViewTab,
  {
    icon: LucideIcon;
    label: string;
  }
> = {
  tree: {
    icon: ListTree,
    label: "Tree",
  },
  transcript: {
    icon: List,
    label: "Transcript",
  },
};

const viewTabs: ViewTab[] = ["tree", "transcript"];

export default function ViewDropdown() {
  const { tab, setTab, showTreeContent, setShowTreeContent } = useTraceViewBaseStore((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    showTreeContent: state.showTreeContent,
    setShowTreeContent: state.setShowTreeContent,
  }));

  const isValidTab = viewTabs.includes(tab as ViewTab);
  const displayTab: ViewTab = isValidTab ? (tab as ViewTab) : "transcript";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;

  const isTreeView = tab === "tree";
  const contentVisible = showTreeContent ?? true;

  const handleSelect = (next: ViewTab) => {
    if (next !== tab) {
      track("traces", "view_switched", { from: tab, to: next });
    }
    setTab(next);
  };

  return (
    <div className="flex items-center min-w-0">
      <DropdownMenu>
        <TranscriptHintPopover>
          {({ open: hintOpen }) => (
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  "flex items-center h-6 px-1.5 text-xs border rounded-md bg-background focus-visible:outline-0",
                  isTreeView && "rounded-r-none border-r-0 outline-inset -outline-offset-1 hover:bg-secondary",
                  hintOpen && "border-primary ring-1 ring-primary/40"
                )}
              >
                <CurrentIcon size={14} className="mr-1" />
                <span className="capitalize">{currentView.label}</span>
                <ChevronDown size={14} className="ml-1" />
              </button>
            </DropdownMenuTrigger>
          )}
        </TranscriptHintPopover>
        <DropdownMenuContent align="start">
          {viewTabs.map((option) => {
            const view = viewOptions[option];
            const OptionIcon = view.icon;
            return (
              <DropdownMenuItem
                key={option}
                onClick={() => handleSelect(option)}
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
          onClick={() => setShowTreeContent(!contentVisible)}
          className={cn(
            "flex items-center h-6 px-1.5 text-xs border rounded-md rounded-l-none text-muted-foreground overflow-hidden",
            contentVisible ? "text-white hover:bg-muted" : "border-input hover:bg-secondary/50"
          )}
        >
          {contentVisible ? (
            <Eye size={14} className="flex-shrink-0" />
          ) : (
            <EyeOff size={14} className="flex-shrink-0" />
          )}
          <span className="ml-1 truncate">Content</span>
        </button>
      )}
    </div>
  );
}
