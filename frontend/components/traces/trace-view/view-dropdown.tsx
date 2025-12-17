import { ChartNoAxesGantt, ChevronDown, List, ListTree, LucideIcon } from "lucide-react";

import { useTraceViewStoreContext } from "@/components/traces/trace-view/trace-view-store.tsx";
import { Button } from "@/components/ui/button.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils.ts";

type ViewTab = "tree" | "timeline" | "list";

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
  list: {
    icon: List,
    label: "List",
  },
};

const VIEW_TABS: ViewTab[] = ["tree", "timeline", "list"];

export default function ViewDropdown() {
  const { tab, setTab } = useTraceViewStoreContext((state) => ({
    tab: state.tab,
    setTab: state.setTab,
  }));

  const isViewTab = VIEW_TABS.includes(tab as ViewTab);
  const displayTab: ViewTab = isViewTab ? (tab as ViewTab) : "tree";
  const currentView = viewOptions[displayTab];
  const Icon = currentView.icon;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          className={cn("h-6 text-xs px-1.5 focus-visible:outline-0", {
            "border-primary text-primary": isViewTab,
          })}
        >
          <Icon size={14} className="mr-1" />
          <span className="capitalize">{currentView.label}</span>
          <ChevronDown size={14} className="ml-1" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {VIEW_TABS.map((viewTab) => {
          const view = viewOptions[viewTab];
          const ViewIcon = view.icon;
          return (
            <DropdownMenuItem
              key={viewTab}
              onClick={() => setTab(viewTab)}
              className={cn(tab === viewTab && "bg-accent")}
            >
              <ViewIcon size={14} />
              {view.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
