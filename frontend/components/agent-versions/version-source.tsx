import { type AgentVersionSource } from "@/lib/actions/agents";

import VersionChangeLink from "./version-change-link";

/** The pull requests (or commits) that made the change, newest first; nothing when unverified. */
export default function VersionSource({ source }: { source: AgentVersionSource }) {
  if (source.status === "unverified") return null;

  return (
    <div className="flex flex-col pt-3">
      {source.changes.toReversed().map((change) => (
        <VersionChangeLink key={change.url} change={change} />
      ))}
    </div>
  );
}
