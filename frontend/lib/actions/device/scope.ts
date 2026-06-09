// The device-flow scope hack: the chosen projectId is smuggled back to the CLI
// on the OAuth `scope` field, the only field BetterAuth's device-token poll
// echoes verbatim. `lmnr_project=<uuid>` is NOT a permission scope — it's
// metadata. Keep the format in one place so the browser writer and the CLI
// parser agree byte-for-byte.

const PROJECT_TOKEN_PREFIX = "lmnr_project=";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The scope string written into the pending deviceCode row before approve. */
export const buildProjectScope = (projectId: string): string => `projects:rw ${PROJECT_TOKEN_PREFIX}${projectId}`;

/**
 * Extract the projectId smuggled in the scope. Tolerates token order and ignores
 * the real `projects:rw`. Returns null when absent or not a valid UUID. Mirror
 * of the CLI-side parser.
 */
export const parseProjectFromScope = (scope?: string | null): string | null => {
  if (!scope) return null;
  for (const token of scope.split(/\s+/)) {
    if (token.startsWith(PROJECT_TOKEN_PREFIX)) {
      const value = token.slice(PROJECT_TOKEN_PREFIX.length);
      return UUID_RE.test(value) ? value : null;
    }
  }
  return null;
};
