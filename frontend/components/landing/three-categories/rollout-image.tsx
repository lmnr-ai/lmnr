"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const RolloutImage = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const traceY = useTransform(scrollYProgress, [0, 1], [0, 0]);

  return (
    <div className={cn("bg-landing-surface-700 overflow-hidden relative rounded-sm", className)} ref={ref}>
      <motion.div className="flex flex-row w-full pl-[200px] pt-[60px]" style={{ y: traceY }}>
        {/* Trace Panel Header - full width, no left label */}
        <div className="w-[600px] bg-red-500 flex flex-col shadow-xl shadow-red-500">
          <div className="w-full bg-blue-500">Trace Header</div>
          <div className="w-full bg-green-500">Span row</div>
          <div className="w-full bg-green-500">Span row</div>
          <div className="w-full bg-green-500">Span row</div>
          <div className="w-full bg-green-500">Span row</div>
          <div className="w-full flex flex-col border border-purple-500 relative bg-gradient-to-b from-landing-surface-500 to-landing-surface-600">
            <div className="absolute w-[200px] left-[-200px] top-0 z-10 h-[100px] bg-landing-primary-400/5 border-t border-landing-primary-400-50 px-[20px]">
              <div className="flex relative">
                (Icon) Rerun
                <div className="flex absolute top-[-100%]">Cache until here</div>
              </div>
            </div>
            <div className="w-full  z-20">Span row</div>
            <div className="w-full ">Span row</div>
            <div className="w-full ">Span row</div>
            <div className="w-full ">Span row</div>
            <div className="w-full  z-20">Span row</div>
            <div className="w-full ">Span row</div>
            <div className="w-full ">Span row</div>
            <div className="w-full ">Span row</div>
          </div>
        </div>
      </motion.div>

      {/* Bottom gradient overlay */}
      <div className="absolute bottom-0 left-0 w-full h-[283px] bg-gradient-to-t from-landing-surface-700 to-transparent z-20 pointer-events-none" />
    </div>
  );
};

export default RolloutImage;
