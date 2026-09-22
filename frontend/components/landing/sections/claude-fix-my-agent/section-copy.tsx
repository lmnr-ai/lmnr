import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import RotatingAgentName from "./rotating-agent-name";

interface Props {
  className?: string;
}

const SectionCopy = ({ className }: Props) => (
  <div className={cn("flex flex-col items-start", className)}>
    <span className={cn(microLabel, "mb-2")}>05.</span>
    <h2 className={cn(subSection, "mb-2")}>
      <RotatingAgentName />
      {", fix my agent with Laminar"}
    </h2>
    <p className={bodyMedium}>
      The Laminar{" "}
      <a
        href="https://laminar.sh/docs/platform/cli"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground-200"
      >
        CLI
      </a>{" "}
      and{" "}
      <a
        href="https://laminar.sh/docs/platform/mcp"
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground-200"
      >
        MCP
      </a>{" "}
      give your coding agent full SQL access to Laminar. <br className="hidden md:block" /> It can investigate traces,
      build evals, and verify fixes.
    </p>
    <LearnMoreLink
      className="mt-5"
      label="Learn more about the Debugger"
      href="https://laminar.sh/docs/debugger/introduction"
    />
  </div>
);

export default SectionCopy;
