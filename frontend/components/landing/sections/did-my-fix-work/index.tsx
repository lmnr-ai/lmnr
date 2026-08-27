import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import EvalComparisonMock from "./eval-comparison-mock";

// Vertical stack: title + subtitle + learn-more on top, mock centered inside a
// surface-250 panel.
const DidMyFixWork = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
      <span className={cn(microLabel, "mb-2")}>06.</span>
      <h2 className={cn(subSection, "mb-2")}>Did the new release break anything?</h2>
      <p className={bodyMedium}>
        Every error cluster you fix can automatically be turned into an eval dataset. <br className="hidden md:block" />
        Run evals after a change to catch regressions and iterate with confidence.
      </p>
      <LearnMoreLink
        className="mt-5"
        label="Learn more about Evals"
        href="https://laminar.sh/docs/evaluations/introduction"
      />
    </div>
    <div className="bg-surface-250 relative flex items-center w-full md:py-[64px] py-[40px] overflow-hidden px-8">
      <div className="shrink-0 mx-auto md:scale-none scale-[80%] origin-left">
        <EvalComparisonMock className="w-[720px]" />
      </div>
    </div>
  </section>
);

export default DidMyFixWork;
