import { memo } from "react";

import CondensedTimelineControls from "@/components/traces/trace-view/header/timeline-toggle";

interface HeaderProps {
  condensedTimelineEnabled: boolean;
  setCondensedTimelineEnabled: (enabled: boolean) => void;
}

const Header = ({ condensedTimelineEnabled, setCondensedTimelineEnabled }: HeaderProps) => {
  return (
    <div className="relative h-0">
      <CondensedTimelineControls enabled={condensedTimelineEnabled} setEnabled={setCondensedTimelineEnabled} />
    </div>
  );
};

export default memo(Header);
