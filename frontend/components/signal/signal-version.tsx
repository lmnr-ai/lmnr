import Mono from "@/components/ui/mono";

/**
 * A stamped signal definition version, rendered as `v4`.
 *
 * 0 is the ClickHouse `DEFAULT` and means the row predates versioning — it is
 * NOT version zero, so it renders as an em dash rather than `v0`. Old rows are
 * deliberately not backfilled to v1: the v1 minted at migration time is today's
 * definition, and an old event may predate several edits of it.
 */
const SignalVersion = ({ version, className }: { version?: number | null; className?: string }) =>
  version ? <Mono className={className}>v{version}</Mono> : <span className={className}>—</span>;

export default SignalVersion;
