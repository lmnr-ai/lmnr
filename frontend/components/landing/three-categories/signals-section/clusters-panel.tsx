"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

import { CLUSTER_DATA, CLUSTER_DATE_LABELS } from "./dummydata";

const BAR_WIDTH = 24;
const BAR_GAP = 4;
const MAX_BAR_PCT = 70;
const BARS_PER_CLUSTER = 20;
const TOTAL_BARS_WIDTH = BARS_PER_CLUSTER * (BAR_WIDTH + BAR_GAP);
const DATE_SPACING = TOTAL_BARS_WIDTH / CLUSTER_DATE_LABELS.length;

interface Props {
  progress: MotionValue<number>;
}

const AnimatedCount = ({ value, progress }: { value: number; progress: MotionValue<number> }) => {
  const count = useTransform(progress, (p) => Math.round(p * value));

  return (
    <motion.span className="font-space-grotesk font-normal leading-[40px] text-[36px] tracking-tighter md:text-[48px] text-landing-surface-400">
      {count}
    </motion.span>
  );
};

const ClustersPanel = ({ progress }: Props) => {
  const barScrollX = useTransform(progress, [0, 1], [0, -(TOTAL_BARS_WIDTH - 359)]);

  return (
    <div className="bg-[#1b1b1c] border border-[#2e2e2f] flex flex-col items-start overflow-hidden rounded w-full h-[80%]">
      <div className="flex items-center pb-2 pl-4 pr-4 pt-4 md:pb-3 md:pl-6 md:pr-5 md:pt-5 shrink-0">
        <p className="font-sans font-medium text-lg md:text-xl text-landing-text-300">Clusters</p>
      </div>

      {/* Main content: sidebar + charts */}
      <div className="border-t border-landing-surface-400 flex items-center w-full flex-1 min-h-0">
        {/* Left sidebar - cluster labels & counts */}
        <div className="bg-[#1b1b1c] border-r border-landing-surface-400 flex flex-col h-full items-start shrink-0 w-[120px] md:w-[164px]">
          {CLUSTER_DATA.map((cluster, i) => (
            <div key={i} className="border-b border-landing-surface-400 flex flex-1 items-start min-h-0 w-full">
              {/* Row number */}
              <div className="flex h-full items-start justify-center py-1 shrink-0 w-4">
                <p className="font-sans text-[10px] leading-4 text-landing-surface-400 text-center">{i + 1}</p>
              </div>
              {/* Name + count */}
              <div className="border-l border-landing-surface-400 flex flex-1 flex-col h-full items-start justify-between min-h-0 px-2 py-1">
                <p className="font-sans text-[10px] md:text-xs text-landing-text-300">{cluster.name}</p>
                <div className="flex items-end justify-end w-full">
                  <AnimatedCount value={cluster.count} progress={progress} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Right area - bar charts (overflows, scrolls with progress) */}
        <div className="bg-[rgba(37,37,38,0.5)] flex flex-col h-full items-start flex-1 min-w-0 overflow-hidden relative">
          {/* Date tick marks - positioned absolutely, scroll with bars */}
          <motion.div style={{ x: barScrollX }} className="absolute inset-0 pointer-events-none z-0">
            <div className="flex h-full items-start pl-2" style={{ gap: DATE_SPACING - 40, width: TOTAL_BARS_WIDTH }}>
              {CLUSTER_DATE_LABELS.map((label, i) => (
                <div key={i} className="flex gap-1 h-full items-start shrink-0">
                  <div className="w-px h-full bg-landing-surface-400" />
                  <p className="font-sans text-[10px] leading-4 text-landing-surface-400">{label}</p>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Bar chart rows */}
          {CLUSTER_DATA.map((cluster, ci) => (
            <div
              key={ci}
              className="flex flex-1 items-end min-h-0 w-full border-b border-landing-surface-400 last:border-b-0"
            >
              <motion.div style={{ x: barScrollX }} className="flex gap-1 items-end pl-2 h-full pb-1 relative z-10">
                {cluster.bars.map((barVal, bi) => (
                  <div
                    key={bi}
                    className="bg-[rgba(208,117,78,0.5)] rounded-t-sm shrink-0"
                    style={{
                      width: BAR_WIDTH,
                      height: `${(barVal / 100) * MAX_BAR_PCT}%`,
                    }}
                  />
                ))}
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ClustersPanel;
