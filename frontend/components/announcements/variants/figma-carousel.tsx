"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { useMemo, useState } from "react";

import { useAnimationSlowdown } from "@/components/dev/use-animation-slowdown";
import { cn } from "@/lib/utils";

import SlideCard, { type CarouselSlide, DEFAULT_SLIDE_HEIGHT } from "../slide-card";
import { useCarouselDials } from "../use-carousel-dials";

interface FigmaCarouselProps {
  slides: CarouselSlide[];
}

// Each slide is double wrapped: a backdrop that only fades (slowly, in place) and the
// card content that slides/rotates/fades. Variant names propagate from backdrop to content.
// zIndex keeps the leaving card above the one taking its place (popLayout lifts it out of flow).
const backdropVariants: Variants = {
  initial: { opacity: 0, zIndex: 0 },
  stack: { opacity: 0, zIndex: 0 },
  animate: { opacity: 1, zIndex: 0 },
  exit: { opacity: 0, zIndex: 1 },
};

const buildContentVariants = (exitRotate: number): Variants => ({
  initial: { opacity: 0, x: 24, rotate: 0 },
  // Revealed by a dismiss: fades in where it sits instead of sliding in.
  stack: { opacity: 0, x: 0, rotate: 0 },
  animate: { opacity: 1, x: 0, y: 0, rotate: 0 },
  exit: { opacity: 0, x: -184, rotate: exitRotate },
});

const FigmaCarousel = ({ slides }: FigmaCarouselProps) => {
  const [index, setIndex] = useState(0);
  // Dismissing fades the next card in where it sits, like a stack; dots slide it in.
  const [enterFrom, setEnterFrom] = useState<"slide" | "stack">("slide");
  const slowdown = useAnimationSlowdown();
  const transition = { type: "spring" as const, visualDuration: 0.35 * slowdown, bounce: 0.15 };
  const { exitRotate, backdropFade } = useCarouselDials();
  const contentVariants = useMemo(() => buildContentVariants(exitRotate), [exitRotate]);
  const current = slides[Math.min(index, slides.length - 1)];

  if (!current) return null;

  return (
    <div className="relative w-full">
      {/* Height transitions between the slides' fixed heights. Not clipped, so an exiting card
          visibly slides out; slides sit at the bottom so a taller one overflows upward mid-resize. */}
      <div
        className="relative flex w-full flex-col justify-end transition-[height] ease-out"
        style={{ height: current.height ?? DEFAULT_SLIDE_HEIGHT, transitionDuration: `${350 * slowdown}ms` }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={current.id}
            variants={backdropVariants}
            initial={enterFrom === "stack" ? "stack" : "initial"}
            animate="animate"
            exit="exit"
            transition={{ duration: backdropFade * slowdown, ease: "easeOut" }}
            className="rounded-[8px] bg-surface-350"
          >
            <motion.div variants={contentVariants} transition={transition}>
              <SlideCard
                {...current}
                onDismiss={() => {
                  setEnterFrom("stack");
                  current.onDismiss();
                }}
              />
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
      {slides.length > 1 && (
        // Out of flow so the card, not the dots, lines up with the content's bottom edge.
        // No gap: each button pads its pill, so hitboxes are larger than the pill and touch.
        <div className="absolute left-1/2 top-full flex -translate-x-1/2 items-center">
          {slides.map((slide, slideIndex) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Show ${slide.title}`}
              aria-current={slide.id === current.id ? "true" : undefined}
              onClick={() => {
                setEnterFrom("slide");
                setIndex(slideIndex);
              }}
              className="group/dot flex h-[18px] items-center px-0.5"
            >
              <span
                style={{ transitionDuration: `${300 * slowdown}ms` }}
                className={cn(
                  "h-[5px] rounded-full transition-[width,background-color] ease-out",
                  slide.id === current.id ? "w-5 bg-[#757780]" : "w-3 bg-[#3b3c40] group-hover/dot:bg-[#757780]"
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
