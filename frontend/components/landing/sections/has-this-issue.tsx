import { bodyMedium, subSection } from "../class-names";
import LearnMoreLink from "./learn-more-link";
import SignalEventClustersMock from "./signal-event-clusters-mock";

// Stacked full-width row: title at top, body + visual + learn-more below.
const HasThisIssue = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <h2 className={subSection}>{"Has this issue\noccurred before?"}</h2>
    <div className="flex flex-col gap-6 items-start w-full">
      <p className={bodyMedium}>Automatically-generated clusters of issues you care about</p>
      <SignalEventClustersMock className="w-full" />
      <LearnMoreLink label="Learn more about Signal event clusters" href="https://laminar.sh/docs/signals" />
    </div>
  </section>
);

export default HasThisIssue;
