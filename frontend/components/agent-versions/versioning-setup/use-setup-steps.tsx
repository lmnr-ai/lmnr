import { SquareArrowOutUpRight } from "lucide-react";
import { type ReactNode } from "react";

import { useProjectContext } from "@/contexts/project-context";

import { githubStepDescription } from "./github-step";
import { useAgentGithubRepo } from "./use-agent-github-repo";

// TODO: point to the release tracking guide once it is published.
const RELEASES_DOCS_URL = "https://laminar.sh/docs/agent-versions/introduction#attach-a-release";

export interface SetupStepState {
  title: string;
  done: boolean;
  description: ReactNode;
}

export interface SetupSteps {
  steps: SetupStepState[];
  done: number;
  complete: boolean;
}

const releasesDescription = (releaseMode: boolean) =>
  releaseMode ? (
    "Versions are grouped by the git release set on your traces."
  ) : (
    <>
      Set <code className="font-mono">LMNR_RELEASE</code> to the git commit SHA in your deployment to pin each trace to
      the release that shipped it. Recommended for the most accurate version detection.{" "}
      <a
        href={RELEASES_DOCS_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-primary-text hover:underline"
      >
        Setup guide
        <SquareArrowOutUpRight className="size-3" />
      </a>
    </>
  );

/** The GitHub step appears once the integration answers, and never in OSS. */
export function useSetupSteps(projectId: string, agentId: string, releaseMode: boolean): SetupSteps {
  const { settingsHref } = useProjectContext();
  const github = useAgentGithubRepo(projectId, agentId);

  const steps: SetupStepState[] = [
    {
      title: "Automatic",
      done: true,
      description: "New versions are detected from changes to the system prompt and tools in your traces.",
    },
    { title: "Git releases", done: releaseMode, description: releasesDescription(releaseMode) },
    ...(github
      ? [
          {
            title: "GitHub integration",
            done: github.status === "linked",
            description: githubStepDescription(github, settingsHref("integrations")),
          },
        ]
      : []),
  ];
  const done = steps.filter((s) => s.done).length;
  return { steps, done, complete: done === steps.length };
}
