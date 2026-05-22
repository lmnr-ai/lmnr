import { cn } from "@/lib/utils";

import { bodyMedium, microLabel, subSection } from "../class-names";
import ClaudeCodeSessionMock from "./claude-code-session-mock";
import RotatingAgentName from "./rotating-agent-name";
import SectionFootnote from "./section-footnote";

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
      <p className={bodyMedium}>MCP, CLI, and SQL API to bring Laminar wherever you work.</p>
    </div>
    <div className="bg-landing-surface-550 relative flex items-center justify-center w-full py-[40px]">
      <ClaudeCodeSessionMock />
      <SectionFootnote name="MCP" href="https://laminar.sh/docs/platform/mcp" />
    </div>
  </section>
);

export default ClaudeFixMyAgent;
