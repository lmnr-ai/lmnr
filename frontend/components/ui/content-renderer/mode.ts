/** Plain module (no CodeMirror/CSS imports) so node:test can import it. */

/**
 * Pick `candidate` only if it is one of `modes`, else fall back to `defaultMode`.
 * Guards both the initial read of the persisted mode and the reconciliation of an
 * already-mounted instance, so a mode that no longer exists — e.g. a `"markdown"`
 * left in localStorage from before that mode was removed — can never be selected.
 */
export const pickMode = (candidate: string | null | undefined, modes: string[], defaultMode: string): string => {
  const normalized = candidate?.toLowerCase();
  if (!normalized) return defaultMode;
  return modes.some((m) => m.toLowerCase() === normalized) ? normalized : defaultMode;
};
