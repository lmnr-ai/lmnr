import Link from "next/link";

import { cn } from "@/lib/utils";

import { bodyMedium } from "../class-names";
import ClaudeCodeSessionMock from "./claude-code-session-mock";
import RotatingAgentName from "./rotating-agent-name";
import Section from "./section";
import SectionBlock from "./section-block";

const INLINE_LINK = "underline decoration-1 underline-offset-2 hover:text-landing-text-100 transition-colors";

const description = (
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
    {` `} bring Laminar to wherever you work
  </p>
);

const ClaudeFixMyAgent = () => (
  <Section
    title={
      <>
        <RotatingAgentName />
        {", fix my agent"}
      </>
    }
  >
    <SectionBlock
      description={description}
      visual={<ClaudeCodeSessionMock />}
      learnMore={{ label: "Learn more about MCP", href: "https://laminar.sh/docs/platform/mcp" }}
      className="max-w-[540px]"
    />
  </Section>
);

export default ClaudeFixMyAgent;
