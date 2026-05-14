import Section from "./section";
import SectionBlock from "./section-block";
import SignalEventClustersMock from "./signal-event-clusters-mock";

const HasThisIssue = () => (
  <Section title={"Has this issue\noccurred before?"}>
    <SectionBlock
      description="Automatically-generated clusters of issues you care about"
      visual={<SignalEventClustersMock />}
      learnMore={{ label: "Learn more about Signals", href: "https://laminar.sh/docs/signals" }}
      className="max-w-[600px]"
    />
  </Section>
);

export default HasThisIssue;
