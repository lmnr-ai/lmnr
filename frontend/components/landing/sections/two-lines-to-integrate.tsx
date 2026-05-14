import IntegrationsGrid from "./integrations-grid";
import Section from "./section";
import SectionBlock from "./section-block";

const TwoLinesToIntegrate = () => (
  <Section title={"Two lines to integrate\nwith your stack"} titleSpacing="mt-13">
    <SectionBlock
      visual={<IntegrationsGrid />}
      learnMore={{ label: "See all integrations", href: "https://laminar.sh/docs/tracing/integrations" }}
      linkGap="gap-10"
      className="max-w-[760px]"
    />
  </Section>
);

export default TwoLinesToIntegrate;
