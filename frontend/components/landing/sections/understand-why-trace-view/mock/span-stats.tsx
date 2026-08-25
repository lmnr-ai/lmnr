import { ArrowRight, CircleDollarSign, Clock3, Coins } from "lucide-react";

import { formatCostNumber, formatDurationMs, formatTokensCompact } from "@/lib/traces/format";

import { type MockSpan } from "../../demo-trace";

const ITEM_CLS = "text-muted-foreground inline-flex items-center gap-1 whitespace-nowrap";

// Duration, tokens in → out with the cached share in green, cost. Zero tokens
// and zero cost are dropped, which is what keeps a tool row to a duration.
const SpanStats = ({ span }: { span: MockSpan }) => {
  const hasTokens = !!span.inputTokens || !!span.outputTokens;

  return (
    <div className="items-center gap-2 text-xs flex shrink-0">
      <div className={ITEM_CLS}>
        <Clock3 size={12} className="min-w-3 min-h-3 size-3" />
        <span>{formatDurationMs(span.endMs - span.startMs)}</span>
      </div>
      {hasTokens && (
        <div className={ITEM_CLS}>
          <Coins size={12} className="min-w-3 min-h-3 size-3" />
          <span>{formatTokensCompact(span.inputTokens)}</span>
          {!!span.cacheReadInputTokens && (
            <span className="text-success-bright">({formatTokensCompact(span.cacheReadInputTokens)})</span>
          )}
          <ArrowRight size={12} />
          <span>{formatTokensCompact(span.outputTokens)}</span>
        </div>
      )}
      {!!span.totalCost && (
        <div className={ITEM_CLS}>
          <CircleDollarSign size={12} className="min-w-3 min-h-3 size-3" />
          <span>{formatCostNumber(span.totalCost)}</span>
        </div>
      )}
    </div>
  );
};

export default SpanStats;
