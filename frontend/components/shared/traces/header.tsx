import { memo } from "react";

import CondensedTimelineControls from "@/components/traces/trace-view/header/timeline-toggle";
import { cn } from "@/lib/utils";

interface HeaderProps {
  condensedTimelineEnabled: boolean;
  setCondensedTimelineEnabled: (enabled: boolean) => void;
}

const Header = ({ condensedTimelineEnabled, setCondensedTimelineEnabled }: HeaderProps) => (
  <div className="relative h-0">
    <CondensedTimelineControls
      enabled={condensedTimelineEnabled}
      setEnabled={setCondensedTimelineEnabled}
      className={cn(condensedTimelineEnabled ? "top-full" : "top-[calc(100%+8px)]")}
    />
  </div>
);

export default memo(Header);
