// Keeps the date range across tab switches but drops saved-view keys, so Events and Runs don't inherit each other's.
export function signalTabSearch(search: string, tab: string): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set("tab", tab);
  if (tab !== "settings") {
    next.delete("section");
    next.delete("version");
  }
  next.delete("v");
  next.delete("filter");
  next.delete("search");
  next.delete("sortBy");
  next.delete("sortDirection");
  return next;
}

// Same reason as above: the date range lives in the query string, and Events re-defaults
// to 72h once it's gone. Every link into a settings section must go through this.
export function signalSectionHref(pathName: string, search: string, section: string): string {
  const next = new URLSearchParams(search);
  next.set("tab", "settings");
  next.set("section", section);
  if (section !== "versions") next.delete("version");
  return `${pathName}?${next.toString()}`;
}

/** Chart marker → Settings → Versions, scrolled to that row. */
export function signalVersionHref(pathName: string, search: string, version: number): string {
  const next = new URLSearchParams(search);
  next.set("tab", "settings");
  next.set("section", "versions");
  next.set("version", String(version));
  return `${pathName}?${next.toString()}`;
}

export function signalClusterHref(pathName: string, search: string, clusterId: string): string {
  const next = signalTabSearch(search, "events");
  next.set("clusterId", clusterId);
  next.delete("emergingClusterId");
  next.delete("traceId");
  next.delete("eventId");
  next.delete("spanId");
  return `${pathName}?${next.toString()}`;
}
