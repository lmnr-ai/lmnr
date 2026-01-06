import { ChartNoAxesGantt, ChevronDown, ListTree, LucideIcon } from "lucide-react";

import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils.ts";

type ViewTab = "tree" | "timeline";

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
  timeline: {
    icon: ChartNoAxesGantt,
    label: "Timeline",
  },
};

const viewTabs: ViewTab[] = ["tree", "timeline"];

export default function ViewDropdown() {
  const { tab, setTab } = useTraceViewStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
  }));

  const isValidTab = viewTabs.includes(tab as ViewTab);
  const displayTab: ViewTab | null = isValidTab ? (tab as ViewTab) : null;
  const currentView = displayTab ? viewOptions[displayTab] : null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-6 text-xs px-1.5 focus-visible:outline-0", {
            "border-primary text-primary": isValidTab,
          })}
        >
          {currentView ? (
            <>
              <currentView.icon size={14} className="mr-1" />
              <span>{currentView.label}</span>
            </>
          ) : (
            <span className="text-muted-foreground">Select view</span>
          )}
          <ChevronDown size={14} className="ml-1" />
        </Button>
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
  );
}
