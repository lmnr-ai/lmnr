import Section from "./section";
import SectionBlock from "./section-block";
import SignalEventCardMock from "./signal-event-card-mock";
import UnderstandWhyTraceView from "./understand-why-trace-view";

const UnderstandWhy = () => (
  <Section title={"Understand why\nin seconds"}>
    <SectionBlock
      visual={<SignalEventCardMock />}
      learnMore={{ label: "Learn more about Signals", href: "https://laminar.sh/docs/signals" }}
    />
    {/* Second block is its own scroll-locked container — text + bento +
        learn-more all live inside the sticky inner. */}
    <UnderstandWhyTraceView />
  </Section>
);

export default UnderstandWhy;
