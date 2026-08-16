/**
 * Shared-trace links embedded in blog markdown.
 *
 *   [label](https://laminar.sh/shared/traces/<traceId>?spanId=<spanId>)
 *
 * Only the PUBLIC `/shared/traces/...` route is recognised. Project links
 * (`/project/<pid>/traces/<tid>`) are deliberately NOT matched: they are
 * auth-gated, so a blog reader clicking one lands on a sign-in wall. They stay
 * plain anchors, which is a visible signal to the author that the link is wrong.
 *
 * This is separate from `lib/traces/span-link-parsing.ts` (which drives span
 * chips inside the trace view) on purpose. Blog content must not resolve span
 * references.
 */

const TRACE_HOSTS = new Set(["lmnr.ai", "www.lmnr.ai", "laminar.sh", "www.laminar.sh"]);

const UUID = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const SHARED_TRACE_PATH = new RegExp(`^/shared/traces/(${UUID})/?$`);
const SHARED_TRACE_SCAN = new RegExp(`/shared/traces/(${UUID})`, "g");

/** Ceiling on distinct traces resolved per post, so one post can't fan out. */
export const MAX_TRACE_LINKS_PER_POST = 50;

export interface SharedTraceLink {
  traceId: string;
  spanId?: string;
}

/**
 * Parse an anchor href into its trace target, or null when it isn't a shared
 * trace link. Relative hrefs are accepted; anything else must be on a known host.
 */
export const parseSharedTraceHref = (href: string): SharedTraceLink | null => {
  let url: URL;
  try {
    url = new URL(href, "https://laminar.sh");
  } catch {
    return null;
  }

  if (!TRACE_HOSTS.has(url.hostname)) return null;

  const match = SHARED_TRACE_PATH.exec(url.pathname);
  if (!match) return null;

  return {
    traceId: match[1].toLowerCase(),
    spanId: url.searchParams.get("spanId") ?? undefined,
  };
};

/**
 * Cheap pre-render sweep of the raw markdown for candidate trace ids. The MDX
 * `a` override can't await, so the public-visibility lookup has to happen
 * before rendering; this collects what to look up. False positives are
 * harmless (they simply won't be in `shared_traces`).
 */
export const collectSharedTraceIds = (content: string): string[] => {
  const ids = new Set<string>();
  for (const match of content.matchAll(SHARED_TRACE_SCAN)) {
    ids.add(match[1].toLowerCase());
    if (ids.size >= MAX_TRACE_LINKS_PER_POST) break;
  }
  return [...ids];
};
