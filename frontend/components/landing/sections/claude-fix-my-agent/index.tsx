import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import ClaudeCodeSessionMock from "./claude-code-session-mock";
import RotatingAgentName from "./rotating-agent-name";

// Vertical stack: title + subtitle on top, terminal session mock centered
// inside a landing-surface-550 panel with a footnote pinned to the bottom.
const ClaudeFixMyAgent = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col items-start">
      <span className={cn(microLabel, "mb-2")}>04.</span>
      <h2 className={cn(subSection, "mb-2")}>
        <RotatingAgentName />
        {", fix my agent"}
      </h2>
      <p className={bodyMedium}>
        With the{" "}
        <a
          href="https://laminar.sh/docs/platform/mcp#mcp-server"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-landing-text-200"
        >
          Laminar MCP
        </a>{" "}
        or{" "}
        <a
          href="https://laminar.sh/docs/platform/cli#cli"
          target="_blank"
          rel="noopener noreferrer"
          className="underline hover:text-landing-text-200"
        >
          CLI
        </a>{" "}
        your coding agent gets all the context. It can write the fix, run your agent again, and query data with raw SQL
        to confirm the fix worked.
      </p>
    </div>
    <div className="bg-landing-surface-550 relative flex items-center w-full md:py-[40px] py-[30px] overflow-hidden px-8">
      <div className="shrink-0 mx-auto md:scale-none scale-[80%] origin-left sm:origin-center">
        <ClaudeCodeSessionMock />
      </div>
      <SectionFootnote name="MCP" href="https://laminar.sh/docs/platform/mcp" />
    </div>
  </section>
);

export default ClaudeFixMyAgent;
