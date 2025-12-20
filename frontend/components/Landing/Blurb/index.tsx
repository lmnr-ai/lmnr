import { cn } from "@/lib/utils";
import { quoteText, quoteSize, quoteAttributionName, quoteAttributionRole } from "../classNames";

interface Props {
  className?: string;
}

const Blurb = ({ className }: Props) => {
  return (
    <div className={cn("bg-landing-surface-900 flex flex-col items-center px-10 py-40", className)}>
      <div className="flex flex-col gap-[50px] items-center">
        <div className={cn(quoteText, "max-w-[840px]")}>
          <p className={cn(quoteSize, "mb-0")}>
            <span className="text-landing-primary-400">&ldquo;</span>
            <span> Laminar's evals help us maintain high </span>
          </p>
          <p className={quoteSize}>
            <span>accuracy while moving fast. We now use them for every LLM based feature we build. </span>
            <span className="text-landing-primary-400">&rdquo;</span>
          </p>
        </div>
        <div className="flex flex-col gap-3 items-center">
          <p className={quoteAttributionName}>Hashim Reman</p>
          <p className={quoteAttributionRole}>CTO, REMO</p>
        </div>
      </div>
    </div>
  );
};

export default Blurb;
