import { useTraceViewBaseStore } from "@/components/traces/trace-view/store/base";
import ViewToggle, { type ViewTab } from "@/components/traces/trace-view/view-toggle";
import { track } from "@/lib/posthog";

export default function ViewDropdown() {
  const { tab, setTab, showTreeContent, setShowTreeContent } = useTraceViewBaseStore((state) => ({
    tab: state.tab,
    setTab: state.setTab,
    showTreeContent: state.showTreeContent,
    setShowTreeContent: state.setShowTreeContent,
  }));

  const displayTab: ViewTab = tab === "tree" ? "tree" : "transcript";
  const contentVisible = showTreeContent ?? true;

  const handleTabChange = (next: ViewTab) => {
    if (next !== tab) {
      track("traces", "view_switched", { from: tab, to: next });
    }
    setTab(next);
  };

  return (
    <ViewToggle
      tab={displayTab}
      onTabChange={handleTabChange}
      showContent={contentVisible}
      onToggleContent={() => setShowTreeContent(!contentVisible)}
    />
  );
}
