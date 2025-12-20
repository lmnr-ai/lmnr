import { cn } from "@/lib/utils";
import { motion, useScroll, useSpring, useTransform } from "framer-motion";
import { Play } from "lucide-react";
import { useRef } from "react";

interface Props {
  className?: string;
}

const SQLImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });
  const offset = useSpring(useTransform(scrollYProgress, [0, 0.5, 1], [80, 20, 0]));

  const opacity = useTransform(scrollYProgress, [0, 0.5, 1], [0, 0.8, 1]);

  // Combine the -50% centering with the scroll offset
  const x = useTransform(offset, (v) => `calc(-50% + ${360 + v}px)`);

  return (
    <div className={cn("bg-landing-surface-700 overflow-hidden relative rounded-sm", className)} ref={ref}>
      {/* Fixed-size content container - centered, then transformed right and down */}
      <motion.div className="absolute left-1/2 top-1/2 flex translate-y-[calc(-50%+160px)]" style={{ x, opacity }}>
        <div className="bg-landing-surface-600 border border-landing-surface-400 flex flex-col gap-3 items-start justify-center px-6 py-4 rounded-sm shrink-0 w-[1179px]">
          {/* SQL Editor Label */}
          <p className="font-sans font-normal leading-normal text-base text-landing-text-300 whitespace-nowrap shrink-0">
            SQL Editor
          </p>

          {/* SQL Query Section */}
          <div className="flex flex-col gap-3 items-end shrink-0 w-[564px]">
            {/* SQL Code Editor */}
            <div className="bg-landing-surface-500 border border-landing-text-600 flex font-mono gap-[14px] h-[127px] items-start leading-normal overflow-hidden px-3 py-2 rounded-sm text-base whitespace-nowrap w-full">
              {/* Line Numbers */}
              <div className="leading-normal shrink-0 text-landing-text-400">
                <p className="mb-0">1</p>
                <p className="mb-0">2</p>
                <p className="mb-0">3</p>
                <p>4</p>
              </div>
              {/* SQL Code */}
              <div className="shrink-0 text-landing-text-200">
                <p className="leading-normal mb-0">
                  <span className="text-landing-primary-400">SELECT</span>
                  <span> *</span>
                </p>
                <p className="leading-normal mb-0">
                  <span className="text-landing-primary-400">FROM</span>
                  <span> spans</span>
                </p>
                <p className="leading-normal mb-0">
                  <span className="text-landing-primary-400">WHERE</span>
                  <span> trace_id = &apos;e44f93ea-35f5-d9d8-1dc1-ae29863504a9&apos;</span>
                </p>
                <p className="leading-normal">
                  <span className="text-landing-primary-400">ORDER</span>
                  <span> BY start_time ASC</span>
                </p>
              </div>
            </div>

            {/* Run Button */}
            <div className="bg-landing-primary-400 flex gap-2 items-center justify-center px-3 py-2 rounded-sm shrink-0">
              <Play className="shrink-0 size-4 text-white fill-white" />
              <p className="font-sans font-normal leading-normal text-base text-white whitespace-nowrap shrink-0">
                Run
              </p>
            </div>
          </div>

          {/* Results Table */}
          <div className="border border-landing-text-600 flex flex-col items-start overflow-hidden rounded-sm shrink-0 w-full">
            {/* Table Header */}
            <div className="bg-landing-surface-500 border-b border-landing-text-600 flex items-center px-4 py-2 shrink-0 w-full">
              <div className="basis-0 flex font-sans font-normal grow items-start justify-between leading-normal min-h-px min-w-px shrink-0 text-xs text-landing-text-500">
                <p className="basis-0 grow min-h-px min-w-px shrink-0">span_id</p>
                <p className="basis-0 grow min-h-px min-w-px shrink-0">name</p>
                <p className="basis-0 grow min-h-px min-w-px shrink-0">span_type</p>
                <p className="basis-0 grow min-h-px min-w-px shrink-0">start_time</p>
                <p className="basis-0 grow min-h-px min-w-px shrink-0">end_time</p>
                <p className="basis-0 grow min-h-px min-w-px shrink-0">duration</p>
              </div>
            </div>

            {/* Table Rows */}
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="border-b border-landing-text-600 flex items-center px-4 py-[10px] shrink-0 w-full"
              >
                <div className="basis-0 flex font-sans font-normal grow items-start justify-between leading-normal min-h-px min-w-px shrink-0 text-sm text-landing-text-300">
                  <p className="basis-0 grow min-h-px min-w-px shrink-0">00000000-0000-00...</p>
                  <p className="basis-0 grow min-h-px min-w-px shrink-0">agent.run</p>
                  <p className="basis-0 grow min-h-px min-w-px shrink-0">DEFAULT</p>
                  <p className="basis-0 grow min-h-px min-w-px shrink-0">2025-12-16 21:48:18.50</p>
                  <p className="basis-0 grow min-h-px min-w-px shrink-0">2025-12-16 21:48:18.50</p>
                  <p className="basis-0 grow min-h-px min-w-px shrink-0">May 05, 5:30</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Gradient overlay at bottom */}
      <div className="absolute bottom-0 left-0 right-0 w-full">
        <div className="bg-gradient-to-t from-landing-surface-700 to-landing-surface-700/0 h-[283px] w-full" />
      </div>
    </div>
  );
};

export default SQLImage;
