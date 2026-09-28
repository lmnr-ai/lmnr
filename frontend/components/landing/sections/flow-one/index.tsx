import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import ComparisonChart from "./comparison-chart";

const FlowOne = () => (
  <section className="flex w-full flex-col items-start gap-10">
    <div className="flex flex-col items-start">
      <h2 className={cn(subSection, "mb-2")}>Powered by our trace analysis model</h2>
      <p className={bodyMedium}>
        <span className="text-primary-100">flow-1</span> was fine-tuned for intelligent and efficient trace analysis.
        <br className="hidden sm:block" />
        Surpassing <span className="text-primary-100">GPT-6 Sol</span> in trace analysis intelligence, while analyzing{" "}
        <span className="text-primary-100">20x</span> more traces per dollar.
      </p>
      <LearnMoreLink className="mt-5" label="Learn more about flow-1" href="/blog/flow-1" />
    </div>
    <ComparisonChart />
  </section>
);

export default FlowOne;
