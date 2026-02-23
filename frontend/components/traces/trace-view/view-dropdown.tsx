import { ChevronDown, Eye, EyeOff, List, ListTree, type LucideIcon } from "lucide-react";

import { useTraceViewContext } from "@/components/traces/trace-view/store/base";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils.ts";

type ViewTab = "tree" | "reader";

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
  reader: {
    icon: List,
    label: "Reader",
  },
};

const viewTabs: ViewTab[] = ["tree", "reader"];

export default function ViewDropdown() {
  const { tab, setTab, showTreeContent, setShowTreeContent } = useTraceViewContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    showTreeContent: state.showTreeContent,
    setShowTreeContent: state.setShowTreeContent,
  }));

  const isValidTab = viewTabs.includes(tab as ViewTab);
  const displayTab: ViewTab = isValidTab ? (tab as ViewTab) : "tree";
  const currentView = viewOptions[displayTab];
  const CurrentIcon = currentView.icon;

  const isTreeView = tab === "tree";
  const contentVisible = showTreeContent ?? true;

  return (
    <div className="flex item-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex items-center h-6 px-1.5 text-xs border rounded-md bg-background focus-visible:outline-0",
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
                onClick={() => setTab(option)}
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
            "flex items-center h-6 px-1.5 text-xs border rounded-md rounded-l-none text-muted-foreground",
            contentVisible ? "text-white hover:bg-muted" : "border-input hover:bg-secondary/50"
          )}
        >
          {contentVisible ? <Eye size={14} className="mr-1" /> : <EyeOff size={14} className="mr-1" />}
          <span>Content</span>
        </button>
      )}
    </div>
  );
}
