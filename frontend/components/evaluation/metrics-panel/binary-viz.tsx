import { binaryCounts } from "@/components/evaluation/metrics-panel/utils";
import { type EvaluationScoreDistributionBucket } from "@/lib/evaluation/types";
import { cn } from "@/lib/utils";

export type BinaryStyle = "bar" | "dual" | "arrow";

interface BinaryVizProps {
  distribution: EvaluationScoreDistributionBucket[] | null;
  comparedDistribution?: EvaluationScoreDistributionBucket[] | null;
  size?: "sm" | "md" | "lg";
  style?: BinaryStyle;
  className?: string;
}

export default function BinaryViz({
  distribution,
  comparedDistribution,
  size = "md",
  style = "dual",
  className,
}: BinaryVizProps) {
  const cur = binaryCounts(distribution);
  const cmp = comparedDistribution ? binaryCounts(comparedDistribution) : null;
  const curRate = cur.total > 0 ? cur.positive / cur.total : 0;
  const cmpRate = cmp && cmp.total > 0 ? cmp.positive / cmp.total : null;

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      {style === "bar" && <BarStyle curRate={curRate} cmpRate={cmpRate} cur={cur} size={size} />}
      {style === "dual" && <DualStyle curRate={curRate} cmpRate={cmpRate} cur={cur} size={size} />}
      {style === "arrow" && <ArrowStyle curRate={curRate} cmpRate={cmpRate} cur={cur} size={size} />}
    </div>
  );
}

type Counts = { positive: number; negative: number; total: number };

function StatLine({
  cur,
  rate,
  cmpRate,
  size = "md",
}: {
  cur: Counts;
  rate: number;
  cmpRate: number | null;
  size?: "sm" | "md" | "lg";
}) {
  // Type ramp: sm=text-xs, md=text-xs, lg=text-base.
  // lg also bumps the headline percentage two steps for readability in expanded view.
  const baseText = size === "lg" ? "text-base" : "text-xs";
  const headlineText = size === "lg" ? "text-xl" : "text-xs";
  const deltaText = size === "lg" ? "text-sm" : "text-[11px]";
  return (
    <div className={cn("flex items-baseline justify-between text-muted-foreground tabular-nums", baseText)}>
      <span>
        <span className="text-success font-medium">{cur.positive}</span> pass /{" "}
        <span className="text-destructive font-medium">{cur.negative}</span> fail
      </span>
      <span className={cn("font-medium text-foreground", headlineText)}>
        {(rate * 100).toFixed(1)}%
        {cmpRate !== null && (
          <span className={cn("ml-2", deltaText, rate >= cmpRate ? "text-success" : "text-destructive")}>
            {rate >= cmpRate ? "▲" : "▼"} {(Math.abs(rate - cmpRate) * 100).toFixed(1)}pp
          </span>
        )}
      </span>
    </div>
  );
}

function BarStyle({
  curRate,
  cmpRate,
  cur,
  size,
}: {
  curRate: number;
  cmpRate: number | null;
  cur: Counts;
  size: "sm" | "md" | "lg";
}) {
  const barH = size === "sm" ? "h-1.5" : size === "lg" ? "h-8" : "h-2.5";
  const markerW = size === "lg" ? "w-1" : "w-0.5";
  return (
    <>
      {size !== "sm" && <StatLine cur={cur} rate={curRate} cmpRate={cmpRate} size={size} />}
      <div className={cn("relative w-full rounded-sm overflow-hidden bg-destructive/20", barH)}>
        <div className="absolute inset-y-0 left-0 bg-success" style={{ width: `${curRate * 100}%` }} />
        {cmpRate !== null && (
          <div
            className="absolute top-0 -translate-x-1/2 h-full pointer-events-none"
            style={{ left: `${cmpRate * 100}%` }}
            title={`Compared: ${(cmpRate * 100).toFixed(1)}%`}
          >
            <div className={cn("h-full bg-foreground/70", markerW)} />
          </div>
        )}
      </div>
    </>
  );
}

function DualStyle({
  curRate,
  cmpRate,
  cur,
  size,
}: {
  curRate: number;
  cmpRate: number | null;
  cur: Counts;
  size: "sm" | "md" | "lg";
}) {
  const barH = size === "sm" ? "h-1" : size === "lg" ? "h-5" : "h-2";
  const sideLabelClass = size === "lg" ? "text-sm" : "text-[10px]";
  const sideLabelWidth = size === "lg" ? "w-10" : "w-8";
  const pctLabelWidth = size === "lg" ? "w-12" : "w-10";
  return (
    <>
      {size !== "sm" && <StatLine cur={cur} rate={curRate} cmpRate={cmpRate} size={size} />}
      <div className={cn("flex flex-col", size === "lg" ? "gap-2" : "gap-0.5")}>
        {cmpRate !== null && (
          <div className="flex items-center gap-1.5">
            {size !== "sm" && (
              <span className={cn("text-muted-foreground tabular-nums shrink-0", sideLabelClass, sideLabelWidth)}>
                prev
              </span>
            )}
            <div className={cn("relative flex-1 rounded-sm overflow-hidden bg-destructive/20", barH)}>
              <div className="absolute inset-y-0 left-0 bg-success/40" style={{ width: `${cmpRate * 100}%` }} />
            </div>
            {size !== "sm" && (
              <span
                className={cn("text-muted-foreground tabular-nums text-right shrink-0", sideLabelClass, pctLabelWidth)}
              >
                {(cmpRate * 100).toFixed(0)}%
              </span>
            )}
          </div>
        )}
        <div className="flex items-center gap-1.5">
          {cmpRate !== null && size !== "sm" && (
            <span className={cn("text-foreground font-medium tabular-nums shrink-0", sideLabelClass, sideLabelWidth)}>
              now
            </span>
          )}
          <div className={cn("relative flex-1 rounded-sm overflow-hidden bg-destructive/20", barH)}>
            <div className="absolute inset-y-0 left-0 bg-success" style={{ width: `${curRate * 100}%` }} />
          </div>
          {cmpRate !== null && size !== "sm" && (
            <span className={cn("font-medium tabular-nums text-right shrink-0", sideLabelClass, pctLabelWidth)}>
              {(curRate * 100).toFixed(0)}%
            </span>
          )}
        </div>
      </div>
    </>
  );
}

// HTML + absolute-positioned divs (so % left works without aspect-ratio distortion).
// The arrowhead is a tiny FIXED-SIZE inline SVG anchored at curr — never scaled.
// With no comparison value, an arrow has nothing to point relative to; fall
// back to a plain progress-bar viz so the cell still communicates the rate.
function ArrowStyle({
  curRate,
  cmpRate,
  cur,
  size,
}: {
  curRate: number;
  cmpRate: number | null;
  cur: Counts;
  size: "sm" | "md" | "lg";
}) {
  if (cmpRate === null) {
    return <BarStyle curRate={curRate} cmpRate={null} cur={cur} size={size} />;
  }
  // lg gets a much taller track so the prev/curr labels above/below have breathing room.
  const trackH = size === "sm" ? 14 : size === "lg" ? 72 : 26;
  const tickClass = size === "lg" ? "h-3 bg-muted-foreground/50" : "h-1.5 bg-muted-foreground/40";
  const segmentH = size === "lg" ? "h-[3px]" : "h-0.5";
  const prevDotSize = size === "lg" ? "w-3 h-3" : "w-1.5 h-1.5";
  const arrowSize = size === "sm" ? 8 : size === "lg" ? 22 : 11;
  const prevLabelClass = size === "lg" ? "text-sm" : "text-[10px]";
  const curLabelClass = size === "lg" ? "text-base font-medium" : "text-[11px] font-medium";
  const improved = cmpRate === null ? true : curRate >= cmpRate;
  const direction: "right" | "left" = cmpRate === null ? "right" : curRate >= cmpRate ? "right" : "left";
  const colorClass = cmpRate === null ? "text-success" : improved ? "text-success" : "text-destructive";

  const lo = cmpRate !== null ? Math.min(cmpRate, curRate) : curRate;
  const hi = cmpRate !== null ? Math.max(cmpRate, curRate) : curRate;

  return (
    <>
      {size !== "sm" && <StatLine cur={cur} rate={curRate} cmpRate={cmpRate} size={size} />}
      <div className="relative w-full" style={{ height: trackH }}>
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-px bg-border" />
        {size !== "sm" &&
          [0, 0.25, 0.5, 0.75, 1].map((t) => (
            <div
              key={t}
              className={cn("absolute top-1/2 -translate-y-1/2 w-px", tickClass)}
              style={{ left: `${t * 100}%` }}
            />
          ))}
        {cmpRate !== null && (
          <>
            <div
              className={cn("absolute top-1/2 -translate-y-1/2", segmentH, improved ? "bg-success" : "bg-destructive")}
              style={{ left: `${lo * 100}%`, width: `${(hi - lo) * 100}%` }}
            />
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-muted-foreground",
                prevDotSize
              )}
              style={{ left: `${cmpRate * 100}%` }}
              title={`Prev: ${(cmpRate * 100).toFixed(1)}%`}
            />
          </>
        )}
        <div
          className={cn("absolute top-1/2 -translate-y-1/2 -translate-x-1/2", colorClass)}
          style={{ left: `${curRate * 100}%` }}
          title={`Now: ${(curRate * 100).toFixed(1)}%`}
        >
          <ArrowHead direction={direction} sizePx={arrowSize} />
        </div>
        {size === "lg" && (
          <>
            {cmpRate !== null && (
              <div
                className={cn("absolute -translate-x-1/2 text-muted-foreground tabular-nums", prevLabelClass)}
                style={{ left: `${cmpRate * 100}%`, top: 0 }}
              >
                {(cmpRate * 100).toFixed(0)}%
              </div>
            )}
            <div
              className={cn("absolute -translate-x-1/2 tabular-nums", curLabelClass)}
              style={{ left: `${curRate * 100}%`, bottom: 0 }}
            >
              {(curRate * 100).toFixed(0)}%
            </div>
          </>
        )}
      </div>
    </>
  );
}

function ArrowHead({ direction, sizePx }: { direction: "right" | "left"; sizePx: number }) {
  const points = direction === "right" ? "0,0 10,5 0,10" : "10,0 0,5 10,10";
  return (
    <svg width={sizePx} height={sizePx} viewBox="0 0 10 10" className="block">
      <polygon points={points} fill="currentColor" />
    </svg>
  );
}
