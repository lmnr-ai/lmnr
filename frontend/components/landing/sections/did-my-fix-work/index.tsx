import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import EvalComparisonMock from "./eval-comparison-mock";

// Vertical stack: title + subtitle on top, mock centered inside a
// landing-surface-550 panel with a footnote pinned to the bottom.
const DidMyFixWork = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
      <span className={cn(microLabel, "mb-2")}>05.</span>
      <h2 className={cn(subSection, "mb-2")}>Did my fix work?</h2>
      <p className={bodyMedium}>Evals help you verify progress, catch regressions, and iterate with confidence</p>
    </div>
    <div className="bg-landing-surface-550 relative flex items-center w-full md:py-[64px] py-[40px] overflow-hidden px-8">
      <div className="shrink-0 mx-auto md:scale-none scale-[80%] origin-left">
        <EvalComparisonMock className="w-[720px]" />
      </div>
      <SectionFootnote name="Evals" href="https://laminar.sh/docs/evals" />
    </div>
  </section>
);

export default DidMyFixWork;
