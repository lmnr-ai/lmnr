import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import SlackThread from "./slack-thread";

// Same shell as the other mock sections: copy on top, mock centered inside a
// surface-500 panel with the footnote pinned to the bottom.
const AskInSlack = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
      <span className={cn(microLabel, "mb-2")}>04.</span>
      <h2 className={cn(subSection, "mb-2")}>{"Be notified and investigate in Slack."}</h2>
      <p className={bodyMedium}>
        Laminar notifies you about new failures in Slack. Mention Laminar to ask
        <br />
        anything about your traces. posts new
      </p>
    </div>
    {/* Shorter than the sibling panels' 120px: the thread card is roughly
        twice as tall as the other mocks, so equal padding reads as a void. */}
    <div className="bg-surface-500 relative flex items-center w-full md:py-[64px] py-[44px] overflow-hidden px-8">
      {/* Unlike the sibling panels the mock has no intrinsic width — it caps
          at 558 and reflows below that, so it just needs centering. */}
      <div className="mx-auto w-full max-w-[558px]">
        <SlackThread />
      </div>
      <SectionFootnote name="Laminar Agent in Slack" href="https://laminar.sh/docs/platform/laminar-agent#slack" />
    </div>
  </section>
);

export default AskInSlack;
