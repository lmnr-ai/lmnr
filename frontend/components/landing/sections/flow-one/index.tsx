import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../../class-names";
import ComparisonChart from "./comparison-chart";

const FlowOne = () => (
  <section className="flex w-full flex-col items-start gap-10">
    <div className="flex flex-col items-start">
      <h2 className={cn(subSection, "mb-2")}>Frontier trace analysis at 1/20th of the cost</h2>
      <p className={bodyMedium}>
        <span className="text-primary-100">flow-1</span> was fine-tuned and post-trained with RL for intelligent and
        efficient trace analysis. <br className="hidden sm:block" />
        Surpassing <span className="text-primary-100">GPT-6 Sol</span> in trace analysis intelligence, while analyzing{" "}
        <span className="text-primary-100">20x</span> more traces per dollar. <br className="hidden sm:block" />
        It automatically catches agent failures <span className="text-primary-100">at scale</span> and helps you fix
        them.
      </p>
    </div>
    <ComparisonChart />
  </section>
);

export default FlowOne;
