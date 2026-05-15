import Link from "next/link";

import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../class-names";
import ClaudeCodeSessionMock from "./claude-code-session-mock";
import LearnMoreLink from "./learn-more-link";
import RotatingAgentName from "./rotating-agent-name";

const INLINE_LINK = "underline decoration-1 underline-offset-2 hover:text-landing-text-100 transition-colors";

// Side-by-side row: title + body (with inline doc links) + learn-more on the
// left, terminal session mock on the right.
const ClaudeFixMyAgent = () => (
  <section className="flex flex-col md:flex-row items-start justify-between gap-10 w-full">
    <div className="flex flex-col gap-6 items-start max-w-[320px]">
      <h2 className={subSection}>
        <RotatingAgentName />
        {", fix my agent"}
      </h2>
      <p className={cn(bodyMedium)}>
        <Link href="https://laminar.sh/docs/platform/mcp" target="_blank" className={INLINE_LINK}>
          MCP
        </Link>
        {", "}
        <Link href="https://laminar.sh/docs/platform/cli" target="_blank" className={INLINE_LINK}>
          CLI
        </Link>
        {", and "}
        <Link href="https://laminar.sh/docs/platform/sql-editor" target="_blank" className={INLINE_LINK}>
          SQL API
        </Link>
        {" to bring Laminar to wherever you work"}
      </p>
      <LearnMoreLink label="Learn more about MCP" href="https://laminar.sh/docs/platform/mcp" />
    </div>
    <ClaudeCodeSessionMock />
  </section>
);

export default ClaudeFixMyAgent;
