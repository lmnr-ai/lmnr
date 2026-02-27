"use client";

import { type MotionValue, useMotionValueEvent } from "framer-motion";
import { ChevronsUpDown } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { DEFINITION_TEXT, SCHEMA_ROWS } from "./dummydata";

interface Props {
  progress: MotionValue<number>;
  className?: string;
}

const DefinitionCard = ({ progress, className }: Props) => {
  const [charCount, setCharCount] = useState(0);

  useMotionValueEvent(progress, "change", (v) => {
    const clamped = Math.max(0, Math.min(1, v));
    setCharCount(Math.round(clamped * DEFINITION_TEXT.length));
  });

  const typedText = DEFINITION_TEXT.slice(0, charCount);
  const isDone = charCount >= DEFINITION_TEXT.length;

  return (
    <div
      className={cn(
        "bg-[#1b1b1c] border border-[#2e2e2f] flex flex-col gap-4 md:gap-6 items-start px-4 py-4 md:px-6 md:py-5 rounded w-full",
        className
      )}
    >
      <p className="font-sans font-medium text-lg md:text-xl text-landing-text-300">My agent failure</p>

      {/* Definition text area */}
      <div className="flex flex-col flex-1 gap-2 items-start min-h-0 w-full">
        <p className="font-sans text-sm md:text-base text-landing-text-300">Definition</p>
        <div className="bg-landing-primary-400-10 border border-landing-primary-400-50 flex flex-1 items-start px-2 py-1.5 md:px-3 md:py-2 rounded min-h-0 w-full">
          <p className="font-sans text-sm md:text-base text-landing-primary-400 leading-5 md:leading-[22px] whitespace-pre-wrap">
            {typedText}
            {!isDone && (
              <span className="inline-block w-[2px] h-[14px] md:h-[16px] bg-landing-primary-400 ml-[1px] align-middle animate-pulse" />
            )}
          </p>
        </div>
      </div>

      {/* Output Schema */}
      <div className="flex flex-col gap-2 items-start w-full">
        <p className="font-sans text-sm md:text-base text-landing-text-300">Output Schema</p>
        <div className="bg-[rgba(37,37,38,0.5)] border border-landing-text-600 flex flex-col gap-1.5 md:gap-2 items-start px-3 py-2 md:px-4 md:py-3 rounded w-full">
          {/* Header */}
          <div className="flex gap-1.5 md:gap-2 items-start w-full">
            <div className="w-[90px] md:w-[120px] shrink-0">
              <p className="font-sans text-sm md:text-base text-landing-text-300">Name</p>
            </div>
            <div className="w-[90px] md:w-[120px] shrink-0">
              <p className="font-sans text-sm md:text-base text-landing-text-300">Type</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-sans text-sm md:text-base text-landing-text-300">Description</p>
            </div>
          </div>
          {/* Rows */}
          {SCHEMA_ROWS.map((row, i) => (
            <div key={i} className="flex gap-1.5 md:gap-2 items-start w-full">
              <div className="bg-landing-surface-500 border border-landing-text-600 flex items-center px-2 py-1.5 md:px-3 md:py-2 rounded shrink-0 w-[90px] md:w-[120px]">
                <p className="font-sans text-sm md:text-base text-landing-text-300">{row.name}</p>
              </div>
              <div className="bg-landing-surface-500 border border-landing-text-600 flex items-center justify-between px-2 py-1.5 md:px-3 md:py-2 rounded shrink-0 w-[90px] md:w-[120px]">
                <p className="font-sans text-sm md:text-base text-landing-text-300">{row.type}</p>
                <ChevronsUpDown className="size-3.5 md:size-4 text-landing-text-300 shrink-0" />
              </div>
              <div className="bg-landing-surface-500 border border-landing-text-600 flex items-center flex-1 min-w-0 px-2 py-1.5 md:px-3 md:py-2 rounded">
                <p className="font-sans text-sm md:text-base text-landing-text-300 truncate">{row.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default DefinitionCard;
