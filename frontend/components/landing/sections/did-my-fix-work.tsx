import { bodyMedium, subSection } from "../class-names";
import EvalComparisonMock from "./eval-comparison-mock";
import LearnMoreLink from "./learn-more-link";

// Stacked full-width row: title at top, body + EvalComparisonMock + learn-more
// below. On mobile, the subtitle's line break is dropped (the narrow viewport
// already wraps the text) and the mock keeps a 600px min width — it overflows
// the right side of the viewport, which is clipped by the page root's
// `overflow-x-clip`.
const DidMyFixWork = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <h2 className={subSection}>Did my fix work?</h2>
    <div className="flex flex-col gap-6 items-start w-full">
      <p className={bodyMedium}>
        Evals help you verify progress, catch regressions,
        <br className="hidden md:inline" /> and iterate with confidence
      </p>
      <EvalComparisonMock className="max-w-none w-full min-w-[600px]" />
      <LearnMoreLink label="Learn more about evals" href="https://laminar.sh/docs/evals" />
    </div>
  </section>
);

export default DidMyFixWork;
