import { bodyMedium, subSection } from "../class-names";
import LearnMoreLink from "./learn-more-link";
import SignalEventClustersMock from "./signal-event-clusters-mock";

// Vertical stack: title + subtitle on top, mock centered inside a
// landing-surface-550 panel, learn-more link below.
const HasThisIssue = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col gap-3 items-start">
      <h2 className={subSection}>{"Has this issue occurred before?"}</h2>
      <p className={bodyMedium}>Automatically-generated clusters of issues you care about</p>
    </div>
    <div className="bg-landing-surface-550 flex items-center justify-center w-full py-[120px]">
      <SignalEventClustersMock />
    </div>
    <LearnMoreLink label="Learn more about Signal event clusters" href="https://laminar.sh/docs/signals" />
  </section>
);

export default HasThisIssue;
