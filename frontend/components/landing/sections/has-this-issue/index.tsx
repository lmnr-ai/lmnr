import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import SignalEventClustersMock from "./signal-event-clusters-mock";

// Vertical stack: title + subtitle on top, mock centered inside a
// landing-surface-550 panel with a footnote pinned to the bottom.
const HasThisIssue = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
      <span className={cn(microLabel, "mb-2")}>03.</span>
      <h2 className={cn(subSection, "mb-2")}>{"Has this issue occurred before?"}</h2>
      <p className={bodyMedium}>Automatically-generated clusters of issues you care about</p>
    </div>
    <div className="bg-landing-surface-550 relative flex items-center w-full md:py-[120px] py-[70px] overflow-hidden px-8">
      {/* mx-auto centers the mock when it fits; when it doesn't (narrow
          viewports) the auto margins collapse to 0 so the mock sticks
          to the start edge instead of overflowing symmetrically.
          shrink-0 keeps the mock at its natural width. */}
      <div className="shrink-0 mx-auto sm:scale-none scale-[80%] origin-left">
        <SignalEventClustersMock />
      </div>
      <SectionFootnote name="Signal clusters" href="https://laminar.sh/docs/signals/clusters" />
    </div>
  </section>
);

export default HasThisIssue;
