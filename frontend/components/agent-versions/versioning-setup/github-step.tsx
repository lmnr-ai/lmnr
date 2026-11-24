import Link from "next/link";

import { useProjectContext } from "@/contexts/project-context";
import { type AgentGithubRepo } from "@/lib/actions/agents";

import SetupStep from "./setup-step";

const DESCRIPTIONS: Record<Exclude<AgentGithubRepo["status"], "linked">, string> = {
  not_connected: "Connect GitHub to see the pull request or commit that changed each version.",
  no_release: "Set up release tracking first: the agent's repo is found by its release commit.",
  not_found: "Couldn't find this agent's latest release commit in the repos the Laminar GitHub App can access.",
};

export default function GithubStep({ github }: { github: AgentGithubRepo }) {
  const { settingsHref } = useProjectContext();

  if (github.status === "linked") {
    return (
      <SetupStep
        done
        title="GitHub"
        description={
          <>
            Versions link to the pull requests and commits in <span className="font-mono">{github.repo}</span> that
            changed them.
          </>
        }
      />
    );
  }
  const action = github.status === "not_found" ? "Manage GitHub access" : "Connect GitHub";
  return (
    <SetupStep
      done={false}
      title="GitHub"
      description={
        <>
          {DESCRIPTIONS[github.status]}{" "}
          {github.status !== "no_release" && (
            <Link href={settingsHref("integrations")} className="text-primary-text hover:underline">
              {action}
            </Link>
          )}
        </>
      }
    />
  );
}
