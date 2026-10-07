import { ArrowUpRight, MessageCircle } from "lucide-react";

import { SpanType } from "@/lib/traces/types";
import { SPAN_TYPE_TO_COLOR } from "@/lib/traces/utils";

/**
 * Inline chip for a shared-trace link in blog prose.
 *
 * Deliberately a standalone implementation rather than a reuse of the trace
 * view's span chip: blog content resolves traces, not spans, and the two are
 * free to diverge. Right now there is no trace-specific icon, so it borrows
 * the LLM span look (purple container + message icon).
 *
 * `href` is rendered verbatim so any `?spanId=` survives the click and the
 * shared trace page preselects that span on load.
 */
export default function SharedTraceChip({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="not-typeset inline-flex items-center gap-1 rounded px-1 py-0.25 align-middle no-underline bg-foreground-300/20 hover:bg-foreground-300/30 transition-colors"
    >
      <span
        className="inline-flex items-center justify-center rounded size-4 shrink-0"
        style={{ backgroundColor: SPAN_TYPE_TO_COLOR[SpanType.LLM] }}
      >
        <MessageCircle className="w-3 h-3 text-white" size={12} />
      </span>
      <span className="text-sm text-secondary-foreground">{label}</span>
      <ArrowUpRight className="w-3.5 h-3.5" />
    </a>
  );
}
