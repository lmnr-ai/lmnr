import { memo } from "react";

import { type ActiveCollapsible } from "@/components/traces/span-view/collapsible";

import BandItem from "./band-item";
import ContextStack from "./context-stack";
import { type Band } from "./use-sticky-band";

interface StickyBandProps {
  band?: Band;
  /** The expanded part the view is inside; its card's header pins under the context card. */
  item?: ActiveCollapsible;
  onCollapseContext: () => void;
  onCollapseItem: () => void;
}

/** Pinned over the top of the list; zero height, so it never shifts the rows under it. */
const StickyBand = ({ band, item, onCollapseContext, onCollapseItem }: StickyBandProps) => (
  <div data-sticky-band className="sticky top-0 z-20 h-0">
    {band && (
      <div data-sticky-band-base className="bg-surface pt-2">
        <ContextStack summary={band.summary} open onToggle={onCollapseContext} />
      </div>
    )}
    {item && <BandItem entry={item.entry} inContext={!!band} onCollapse={onCollapseItem} />}
  </div>
);

export default memo(StickyBand);
