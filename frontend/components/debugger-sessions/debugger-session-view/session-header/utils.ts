import { formatShortRelativeTime } from "@/components/client-timestamp-formatter";

// ms === undefined means the session's traces haven't loaded yet — show a quiet
// ellipsis rather than a dash (em dashes are banned in copy, and a hyphen reads
// like a real value).
const PENDING = "…";

export const fmtRelative = (ms?: number): string => (ms ? formatShortRelativeTime(new Date(ms)) : PENDING);
