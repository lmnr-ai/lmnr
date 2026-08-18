import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import LearnMoreLink from "../learn-more-link";
import DebuggerScene from "./debugger-scene";
import RotatingAgentName from "./rotating-agent-name";

// Vertical stack: title + subtitle + learn-more on top, then a surface-250
// panel holding the coding-agent terminal.
const ClaudeFixMyAgent = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
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
        are your coding agent's interface to Laminar. <br className="hidden md:block" />
        It can find failures, run your agent, read traces, make changes, and run evals to verify progress.
      </p>
      <LearnMoreLink
        className="mt-5"
        label="Learn more about the Debugger"
        href="https://laminar.sh/docs/debugger/introduction"
      />
    </div>
    <div className="bg-surface-250 relative flex w-full overflow-hidden">
      <DebuggerScene />
    </div>
  </section>
);

export default ClaudeFixMyAgent;
