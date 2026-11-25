import Link from "next/link";
import { type ReactNode } from "react";

import { type AgentGithubRepo } from "@/lib/actions/agents";

const SETUP_DESCRIPTION =
  "Integrate GitHub to link each version to the pull request or commit that introduced it. Requires git releases.";

const DESCRIPTIONS: Record<Exclude<AgentGithubRepo["status"], "linked">, string> = {
  not_connected: SETUP_DESCRIPTION,
  no_release: SETUP_DESCRIPTION,
  not_found:
    "Versions aren't linked to pull requests yet: none of the repos the Laminar GitHub App can access has this agent's latest release commit.",
};

export function githubStepDescription(github: AgentGithubRepo, integrationsHref: string): ReactNode {
  if (github.status === "linked") {
    return (
      <>
        Versions link to the pull requests and commits in <span className="font-mono">{github.repo}</span> that changed
        them.
      </>
    );
  }
  return (
    <>
      {DESCRIPTIONS[github.status]}{" "}
      <Link href={integrationsHref} className="text-primary-text hover:underline">
        {github.status === "not_found" ? "Manage GitHub access" : "GitHub integration"}
      </Link>
    </>
  );
}
