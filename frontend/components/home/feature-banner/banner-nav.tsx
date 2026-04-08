import { ChevronDown, ChevronUp } from "lucide-react";

import { cn } from "@/lib/utils";

interface BannerNavProps {
  activeIndex: number;
  totalSlides: number;
  onPrev: () => void;
  onNext: () => void;
  onSelect: (index: number) => void;
}

export default function BannerNav({ activeIndex, totalSlides, onPrev, onNext, onSelect }: BannerNavProps) {
  return (
    <div className="flex flex-col items-center justify-between self-stretch shrink-0 rounded-xl">
      <button onClick={onPrev} className="text-muted-foreground hover:text-foreground transition-colors">
        <ChevronUp size={16} />
      </button>
      <div className="flex flex-col gap-2 items-center">
        {Array.from({ length: totalSlides }).map((_, index) => (
          <button
            key={index}
            onClick={() => onSelect(index)}
            className={cn(
              "size-1.5 rounded-full transition-colors",
              index === activeIndex ? "bg-primary" : "bg-muted-foreground/50"
            )}
          />
        ))}
      </div>
      <button onClick={onNext} className="text-muted-foreground hover:text-foreground transition-colors">
        <ChevronDown size={16} />
      </button>
    </div>
  );
}
