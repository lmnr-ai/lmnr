import { type GithubConnectStatus } from "@/lib/actions/github/types";
import { githubAppConfig } from "@/lib/github/config";
import { BASE_PATH, sanitizeCallbackUrl } from "@/lib/utils";

export const defaultReturnTo = (projectId: string) => `/project/${projectId}/settings?tab=integrations`;

export function sanitizeReturnTo(raw: string | null, projectId: string): string {
  return sanitizeCallbackUrl(raw ?? undefined, defaultReturnTo(projectId));
}

export function installUrl(state: string): string {
  return `https://github.com/apps/${githubAppConfig.slug()}/installations/new?state=${encodeURIComponent(state)}`;
}

// NextResponse.redirect is not BASE_PATH-aware, so absolute targets are origin + BASE_PATH + path.
export function appUrl(path: string, status?: GithubConnectStatus): string {
  const base = `${new URL(process.env.NEXT_PUBLIC_URL!).origin}${BASE_PATH}`;
  if (!status) return `${base}${path}`;
  const url = new URL(path, "https://placeholder.invalid");
  url.searchParams.set("github", status);
  return `${base}${url.pathname}${url.search}${url.hash}`;
}
