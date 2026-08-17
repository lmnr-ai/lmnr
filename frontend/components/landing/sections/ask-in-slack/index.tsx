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
      <h2 className={cn(subSection, "mb-2")}>
        Be notified and
        <br className="block sm:hidden" />
        {` `}
        investigate in Slack.
      </h2>
      <p className={bodyMedium}>
        Laminar notifies you about new failures in Slack. Mention Laminar <br className="hidden md:block" />
        to ask anything about your traces.
      </p>
    </div>
    {/* Shorter than the sibling panels' 120px: the thread card is roughly
        twice as tall as the other mocks, so equal padding reads as a void. */}
    {/* The panel's height is the window plus its own padding, so the padding is
        3px shy of the sibling panels' round number: the window came down 6 and
        the panel had to come down 12, which the extra 2x3 accounts for. */}
    <div className="bg-surface-500 relative flex items-center w-full md:py-[61px] py-[44px] overflow-hidden px-8">
      {/* Same overflow trick as the evals/debugger panels: a fixed width that
          `shrink-0` protects, so `mx-auto` centers it when there's room and it
          pins left and runs off the right when there isn't, rather than
          reflowing the thread. */}
      <div className="mx-auto w-[552px] shrink-0">
        <SlackThread />
      </div>
      <SectionFootnote name="Laminar Agent in Slack" href="https://laminar.sh/docs/platform/laminar-agent#slack" />
    </div>
  </section>
);

export default AskInSlack;
