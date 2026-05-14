import EvalComparisonMock from "./eval-comparison-mock";
import Section from "./section";
import SectionBlock from "./section-block";

const DidMyFixWork = () => (
  <Section title="Did my fix work?">
    <SectionBlock
      description={"Evals help you verify progress, catch regressions,\nand iterate with confidence"}
      visual={<EvalComparisonMock />}
      learnMore={{ label: "Learn more about evals", href: "https://laminar.sh/docs/evals" }}
      className="max-w-[760px]"
    />
  </Section>
);

export default DidMyFixWork;
