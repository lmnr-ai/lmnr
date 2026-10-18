export function agentDisplayName(name: string | null): string {
  return name ?? "Unnamed agent";
}

export function shortHash(hash: string): string {
  return hash.slice(0, 8);
}
