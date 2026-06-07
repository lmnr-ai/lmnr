// Sanitize a CLI-supplied hostname before embedding it in an api-key name.
// Keep alphanumerics plus a small safe set including `-` (common in hostnames
// like `my-laptop`); drop control chars / newlines. A bare `-` can't break the
// ` - ` (space-dash-space) key-name separator, so it's safe to allow.
export function sanitizeHostname(host: string | undefined | null): string {
  if (!host) return "";
  return host
    .replace(/[^a-zA-Z0-9._-]/g, "")
    .trim()
    .slice(0, 64);
}

// API-key name format mirrors the old grant flow: `CLI - <host> - <date>`.
export function cliKeyName(host: string | undefined | null): string {
  const clean = sanitizeHostname(host) || "unknown-host";
  const today = new Date().toISOString().slice(0, 10);
  return `CLI - ${clean} - ${today}`;
}
