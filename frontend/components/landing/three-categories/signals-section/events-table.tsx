"use client";

import { motion, type MotionValue, useTransform } from "framer-motion";

import { EVENTS_DATA } from "./dummydata";

interface Props {
  progress: MotionValue<number>;
}

const EventsTable = ({ progress }: Props) => {
  const eased = useTransform(progress, (v) => 1 - Math.pow(1 - v, 3)); // easeOutCubic
  const y = useTransform(eased, [0, 1], [0, -100]);

  return (
    <div className="bg-[#1b1b1c] border border-[#2e2e2f] flex flex-col items-start overflow-hidden rounded w-full h-[80%]">
      <div className="flex items-center pb-2 pl-4 pr-4 pt-4 md:pb-3 md:pl-6 md:pr-5 md:pt-5 shrink-0">
        <p className="font-sans font-medium text-lg md:text-xl text-landing-text-300">Events</p>
      </div>
      <div className="bg-[rgba(37,37,38,0.5)] border-t border-landing-surface-400 flex flex-col items-start w-full flex-1 min-h-0 overflow-hidden">
        {/* Header - static */}
        <div className="border-b border-landing-surface-400 flex items-start px-4 md:px-6 w-full shrink-0">
          <div className="flex items-center py-1 md:py-1.5 shrink-0 w-[90px] md:w-[120px]">
            <p className="font-sans text-[10px] md:text-xs text-landing-text-300">Timestamp</p>
          </div>
          <div className="flex items-center py-1 md:py-1.5 shrink-0 w-[90px] md:w-[120px]">
            <p className="font-sans text-[10px] md:text-xs text-landing-text-300">Category</p>
          </div>
          <div className="flex flex-1 items-center min-w-0 py-1 md:py-1.5">
            <p className="font-sans text-[10px] md:text-xs text-landing-text-300">Description</p>
          </div>
        </div>
        {/* Rows - auto-scrolled via progress */}
        <div className="flex-1 min-h-0 overflow-hidden w-full">
          <motion.div style={{ y }} className="flex flex-col items-start w-full">
            {EVENTS_DATA.map((event, i) => (
              <div
                key={i}
                className="border-b border-landing-surface-400 flex items-start px-4 md:px-6 w-full shrink-0"
              >
                <div className="flex items-center py-1.5 md:py-2 shrink-0 w-[90px] md:w-[120px]">
                  <p className="font-sans text-sm md:text-base text-landing-text-300 whitespace-nowrap">
                    {event.timestamp}
                  </p>
                </div>
                <div className="flex items-center py-1.5 md:py-2 shrink-0 w-[90px] md:w-[120px]">
                  <p className="font-sans text-sm md:text-base text-landing-text-300">{event.category}</p>
                </div>
                <div className="flex flex-1 items-center min-w-0 py-1.5 md:py-2">
                  <p className="font-sans text-sm md:text-base text-landing-text-300 truncate">{event.description}</p>
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default EventsTable;
