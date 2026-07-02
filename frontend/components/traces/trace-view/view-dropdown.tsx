import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import ViewToggle, { type ViewTab } from "@/components/traces/trace-view/view-toggle";
import { track } from "@/lib/posthog";

interface ViewDropdownProps {
  /** Tabs offered in the dropdown. The shared trace page passes tree/transcript
   *  only — Custom needs authenticated render-data access it doesn't have. */
  tabs?: ViewTab[];
}

export default function ViewDropdown({ tabs = ["tree", "transcript", "custom"] }: ViewDropdownProps) {
  const { tab, setTab, showTreeContent, setShowTreeContent } = useTraceViewBaseStore((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    showTreeContent: state.showTreeContent,
    setShowTreeContent: state.setShowTreeContent,
  }));

  const contentVisible = showTreeContent ?? true;

  const handleTabChange = (next: ViewTab) => {
    if (next !== tab) {
      track("traces", "view_switched", { from: tab, to: next });
    }
    setTab(next);
  };

  return (
    <ViewToggle
      tab={tab}
      onTabChange={handleTabChange}
      showContent={contentVisible}
      onToggleContent={() => setShowTreeContent(!contentVisible)}
      tabs={tabs}
    />
  );
}
