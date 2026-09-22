import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import ComparisonChart from "./comparison-chart";

const FlowOne = () => (
  <section className="flex w-full flex-col items-start gap-10">
    <div className="flex flex-col items-start">
      <h2 className={cn(subSection, "mb-2")}>Powered by our trace analysis model</h2>
      <p className={bodyMedium}>
        <span className="text-primary-100">Flow-1</span> was fine-tuned for intelligent and efficient trace analysis.
        <br className="hidden sm:block" />
        Matching <span className="text-primary-100">Sonnet-5</span> in trace analysis intelligence, while analyzing 37x
        more traces per dollar.
      </p>
      <LearnMoreLink className="mt-5" label="Learn more about Flow-1" href="/blog/flow-1" />
    </div>
    <ComparisonChart />
  </section>
);

export default FlowOne;
