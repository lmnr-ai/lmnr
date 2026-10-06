"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { X } from "lucide-react";
import Image from "next/image";
import { useState } from "react";

import { type Announcement } from "@/lib/announcements/types";
import { cn } from "@/lib/utils";

interface FigmaCarouselProps {
  announcements: Announcement[];
  onDismiss: (id: string) => void;
  onOpenDetails: (id: string) => void;
}

const cardVariants: Variants = {
  initial: { opacity: 0, x: 24 },
  animate: { opacity: 1, x: 0, y: 0 },
  exit: { opacity: 0, x: -184 },
};

const transition = { type: "spring" as const, visualDuration: 0.35, bounce: 0.15 };

const FigmaCarousel = ({ announcements, onDismiss, onOpenDetails }: FigmaCarouselProps) => {
  const [index, setIndex] = useState(0);
  const [isCloseHovered, setIsCloseHovered] = useState(false);
  const current = announcements[Math.min(index, announcements.length - 1)];

  if (!current) return null;

  return (
    <div className="flex w-full flex-col items-center justify-end gap-[6px] px-[4px]">
      <div className="relative h-[157px] w-full overflow-hidden rounded-[8px]">
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={current.id}
            variants={cardVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={transition}
            role={current.long_description ? "button" : undefined}
            tabIndex={current.long_description ? 0 : undefined}
            onClick={() => current.long_description && onOpenDetails(current.id)}
            onKeyDown={(event) =>
              event.target === event.currentTarget &&
              event.key === "Enter" &&
              current.long_description &&
              onOpenDetails(current.id)
            }
            className={cn(
              "absolute inset-0 flex flex-col items-end justify-end gap-[4px] overflow-hidden rounded-[8px] bg-surface-200 px-[10px] pb-[10px] pt-[8px] transition-colors",
              current.long_description && !isCloseHovered && "cursor-pointer hover:bg-surface-350"
            )}
          >
            <div
              className="pointer-events-none absolute inset-x-0 top-0 h-[157px] overflow-hidden rounded-[8px] p-[2px]"
              style={{
                maskImage: "linear-gradient(to bottom, white 23.5577%, transparent 77.8846%)",
                WebkitMaskImage: "linear-gradient(to bottom, white 23.5577%, transparent 77.8846%)",
              }}
            >
              <div className="relative h-full w-full overflow-hidden rounded-[6px]">
                {current.card_image_src ? (
                  <>
                    <Image src={current.card_image_src} alt="" fill sizes="256px" className="object-cover object-top" />
                    <div className="absolute left-[42px] top-[-82px] h-[210px] w-[213px] rotate-[44deg]">
                      <div className="mt-[65px] h-[80px] w-[219px] bg-gradient-to-b from-surface-00 to-transparent" />
                    </div>
                  </>
                ) : (
                  <div className="absolute inset-0 bg-surface-100" />
                )}
              </div>
            </div>
            <button
              type="button"
              aria-label="Got it"
              title="Got it"
              onClick={(event) => {
                event.stopPropagation();
                onDismiss(current.id);
              }}
              onPointerEnter={() => setIsCloseHovered(true)}
              onPointerLeave={() => setIsCloseHovered(false)}
              className="group/close absolute right-0 top-0 flex items-center p-[8px] text-secondary-foreground hover:text-foreground"
            >
              <span className="flex size-[24px] items-center justify-center rounded-full bg-surface-300 transition-colors group-hover/close:bg-surface-450">
                <X className="size-[14px]" />
              </span>
            </button>
            <div className="relative flex w-full flex-col items-start gap-[4px] text-[12px] font-normal leading-normal">
              <p className="whitespace-nowrap text-white">{current.title}</p>
              <p className="text-secondary-foreground">{current.description}</p>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {announcements.length > 1 && (
        <div className="flex items-center">
          {announcements.map((announcement, announcementIndex) => (
            <button
              key={announcement.id}
              type="button"
              aria-label={`Show ${announcement.title}`}
              aria-current={announcement.id === current.id ? "true" : undefined}
              onClick={() => setIndex(announcementIndex)}
              className="group/dot flex items-center p-[2px]"
            >
              <span
                className={cn(
                  "h-[6px] rounded-full transition-[width,background-color]",
                  announcement.id === current.id
                    ? "w-[16px] bg-[#757780]"
                    : "w-[6px] bg-[#3b3c40] group-hover/dot:bg-[#757780]"
                )}
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FigmaCarousel;
