import { z } from "zod/v4";

import { createInstallationToken, GitHubApiError, githubRequest } from "@/lib/github/client";

export const PR_BRANCH_PREFIX = "laminar/";
// The app has no Workflows permission, so GitHub rejects any push touching these.
const WORKFLOWS_DIR = ".github/workflows/";

export type FileChange = { path: string; content: string } | { path: string; deleted: true };

export interface OpenPullRequestInput {
  installationId: number;
  repoId: number;
  baseSha: string;
  branch: string;
  files: FileChange[];
  title: string;
  body: string;
}

export function findWorkflowFiles(files: FileChange[]): string[] {
  return files.map((f) => f.path.replace(/^\.?\//, "")).filter((path) => path.startsWith(WORKFLOWS_DIR));
}

const CreateCommitResponseSchema = z.object({
  data: z.object({ createCommitOnBranch: z.object({ commit: z.object({ oid: z.string() }) }) }).nullable(),
  errors: z.array(z.object({ message: z.string() })).optional(),
});

const PullRequestSchema = z.object({ number: z.number(), html_url: z.string() });

const CREATE_COMMIT_MUTATION = `
  mutation ($input: CreateCommitOnBranchInput!) {
    createCommitOnBranch(input: $input) { commit { oid } }
  }
`;

export async function openPullRequestFromDiff(input: OpenPullRequestInput): Promise<{ number: number; url: string }> {
  const { installationId, repoId, baseSha, branch, files, title, body } = input;

  if (!branch.startsWith(PR_BRANCH_PREFIX)) {
    throw new Error(`Branch must start with "${PR_BRANCH_PREFIX}".`);
  }
  if (files.length === 0) {
    throw new Error("No file changes to commit.");
  }
  const workflowFiles = findWorkflowFiles(files);
  if (workflowFiles.length > 0) {
    throw new Error(`Changes to GitHub Actions workflows are not allowed: ${workflowFiles.join(", ")}`);
  }

  const { token, repositories } = await createInstallationToken(installationId, {
    repositoryIds: [repoId],
    permissions: { contents: "write", pull_requests: "write" },
  });
  const repo = repositories?.find((r) => r.id === repoId);
  if (!repo) {
    throw new Error("Repository is not accessible to the GitHub installation.");
  }

  await githubRequest(`/repos/${repo.full_name}/git/refs`, z.unknown(), {
    token,
    method: "POST",
    body: { ref: `refs/heads/${branch}`, sha: baseSha },
  });

  // GraphQL commits are signed by GitHub, so they show as Verified and pass signed-commit rules.
  const commit = await githubRequest("/graphql", CreateCommitResponseSchema, {
    token,
    method: "POST",
    body: {
      query: CREATE_COMMIT_MUTATION,
      variables: {
        input: {
          branch: { repositoryNameWithOwner: repo.full_name, branchName: branch },
          expectedHeadOid: baseSha,
          message: { headline: title },
          fileChanges: {
            additions: files.flatMap((f) =>
              "content" in f ? [{ path: f.path, contents: Buffer.from(f.content).toString("base64") }] : []
            ),
            deletions: files.flatMap((f) => ("deleted" in f ? [{ path: f.path }] : [])),
          },
        },
      },
    },
  });
  if (!commit.data || commit.errors?.length) {
    throw new GitHubApiError(`GitHub commit failed: ${commit.errors?.map((e) => e.message).join("; ")}`, 422);
  }

  const pr = await githubRequest(`/repos/${repo.full_name}/pulls`, PullRequestSchema, {
    token,
    method: "POST",
    body: { title, body, head: branch, base: repo.default_branch },
  });
  return { number: pr.number, url: pr.html_url };
}
