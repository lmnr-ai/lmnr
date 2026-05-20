import { bodyMedium, subSection } from "../class-names";
import ClaudeCodeSessionMock from "./claude-code-session-mock";
import LearnMoreLink from "./learn-more-link";
import RotatingAgentName from "./rotating-agent-name";

// Vertical stack: title + subtitle on top, terminal session mock centered
// inside a landing-surface-550 panel, learn-more link below.
const ClaudeFixMyAgent = () => (
  <section className="flex flex-col gap-10 items-start w-full">
    <div className="flex flex-col gap-3 items-start">
      <h2 className={subSection}>
        <RotatingAgentName />
        {", fix my agent"}
      </h2>
      <p className={bodyMedium}>MCP, CLI, and SQL API to bring Laminar wherever you work.</p>
    </div>
    <div className="bg-landing-surface-550 flex items-center justify-center w-full py-[40px]">
      <ClaudeCodeSessionMock />
    </div>
    <LearnMoreLink label="Learn more about MCP" href="https://laminar.sh/docs/platform/mcp" />
  </section>
);

export default ClaudeFixMyAgent;
