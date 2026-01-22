"use client";

import { cn } from "@/lib/utils";

interface ChapterButtonProps {
  label: string;
  isActive: boolean;
  progress: number;
  onClick: () => void;
}

const ChapterButton = ({ label, isActive, progress, onClick }: ChapterButtonProps) => (
  <button
    className={cn(
      "flex flex-col gap-[6px] flex-1 text-left cursor-pointer transition-colors duration-300",
      isActive ? "text-landing-text-100" : "text-landing-text-400 hover:text-landing-text-200"
    )}
    onClick={onClick}
  >
    <span className="text-base font-normal whitespace-pre-line leading-tight py-1">{label}</span>
    <div className="h-[2px] w-full bg-landing-text-600">
      {isActive && (
        <div className="h-full bg-landing-primary-400 transition-all duration-100" style={{ width: `${progress}%` }} />
      )}
    </div>
  </button>
);

export default ChapterButton;
