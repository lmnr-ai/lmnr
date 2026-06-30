import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import DebuggerScene from "./debugger-scene";
import RotatingAgentName from "./rotating-agent-name";

// Vertical stack: title + subtitle on top, then a surface-500 panel holding the
// coding-agent terminal (left) beside a mock of the Laminar debugger session it
// drives (right), with a footnote pinned to the bottom.
const ClaudeFixMyAgent = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
      <span className={cn(microLabel, "mb-2")}>04.</span>
      <h2 className={cn(subSection, "mb-2")}>
        <RotatingAgentName />
        {", fix my agent"}
      </h2>
      <p className={bodyMedium}>
        With Laminar{" "}
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
        </a>
        , your coding agent fully owns the iteration loop for the agents you're building. It runs your agent, reads the
        trace, fixes, and re-runs with cached state. You can then review its work in the Debugger session UI.
      </p>
    </div>
    <div className="bg-surface-500 relative flex w-full overflow-hidden">
      <DebuggerScene />
      <SectionFootnote name="Debugger" href="https://laminar.sh/docs/debugger/introduction" />
    </div>
  </section>
);

export default ClaudeFixMyAgent;
