// Keeps the date range across tab switches but drops saved-view keys, so Events and Runs don't inherit each other's.
export function signalTabSearch(search: string, tab: string): URLSearchParams {
  const next = new URLSearchParams(search);
  next.set("tab", tab);
  if (tab !== "settings") next.delete("section");
  next.delete("v");
  next.delete("filter");
  next.delete("search");
  next.delete("sortBy");
  next.delete("sortDirection");
  return next;
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
