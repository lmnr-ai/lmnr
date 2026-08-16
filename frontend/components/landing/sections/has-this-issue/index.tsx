import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import SignalEventClustersMock from "./signal-event-clusters-mock";

// Vertical stack: title + subtitle on top, mock centered inside a
// surface-500 panel with a footnote pinned to the bottom.
const HasThisIssue = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
      <span className={cn(microLabel, "mb-2")}>03.</span>
      <h2 className={cn(subSection, "mb-2")}>{"Has this failure occurred before?"}</h2>
      <p className={bodyMedium}>
        Laminar groups failures into named clusters and tracks each one over time. When a cluster stops recurring,
        Laminar resolves it - and reopens it if the issue returns.
      </p>
    </div>
    {/* NO vertical padding, unlike the other sections: the mock's stage IS this
        frame (it sets its own FRAME_H) and the frame's edge is where the pill
        gets clipped as it falls in. Adding padding back would push the clip
        boundary outward and shorten the visible fall. The lane above and below
        the clusters card lives inside the mock instead. */}
    {/* h-[432px] is FRAME_H × the mobile scale below, and the two MUST move
        together. `transform` does not change the layout box, so a scaled mock
        still reserves its full 540px and leaves a dead band above and below the
        stage — and the pill falls through that band UNCLIPPED, popping into
        existence 54px inside the frame instead of sliding in over its edge.
        `items-start` + `origin-top-left` then pin the scaled stage flush to the
        frame's top-left corner, which is the edge the pill has to enter from. */}
    <div className="bg-surface-500 relative flex items-start w-full overflow-hidden px-8 h-[432px] sm:h-auto">
      {/* mx-auto centers the mock when it fits; when it doesn't (narrow
          viewports) the auto margins collapse to 0 so the mock sticks
          to the start edge instead of overflowing symmetrically.
          shrink-0 keeps the mock at its natural width. */}
      <div className="shrink-0 mx-auto sm:scale-none scale-[80%] origin-top-left">
        <SignalEventClustersMock />
      </div>
      <SectionFootnote name="Signal clusters" href="https://laminar.sh/docs/signals/clusters" />
    </div>
  </section>
);

export default HasThisIssue;
