import { subSection } from "../../class-names";
import IntegrationsGrid from "./integrations-grid";
import LearnMoreLink from "./learn-more-link";

// Stacked full-width row: title at top, 3-col integrations grid + learn-more
// below.
const TwoLinesToIntegrate = () => (
  <section className="flex flex-col gap-[52px] items-start w-full">
    <h2 className={subSection}>{"Two lines to integrate with your stack"}</h2>
    <div className="flex flex-col gap-10 items-start w-full">
      <IntegrationsGrid className="max-w-none w-full" />
      <LearnMoreLink label="See all" href="https://laminar.sh/docs/tracing/integrations" />
    </div>
  </section>
);

export default TwoLinesToIntegrate;
