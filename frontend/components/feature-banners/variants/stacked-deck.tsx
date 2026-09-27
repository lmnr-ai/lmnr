"use client";

import { AnimatePresence, motion } from "motion/react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type FeatureBanner } from "@/lib/feature-banners/types";
import { cn, withBasePath } from "@/lib/utils";

import { type FeatureBannerDials, toMotionTransition } from "../dials";
import { useFeatureBannerStore } from "../store";

interface VariantProps {
  banners: FeatureBanner[];
  dials: FeatureBannerDials;
}

// Variant A: a deck of cards. The top card is fully visible; the next few peek out above it.
const StackedDeck = ({ banners, dials }: VariantProps) => {
  const acknowledge = useFeatureBannerStore((s) => s.acknowledge);
  const openDetails = useFeatureBannerStore((s) => s.openDetails);
  const { card, dismiss, stack } = dials;
  const transition = toMotionTransition(dismiss.transition);
  const visible = banners.slice(0, stack.peekCount + 1);

  return (
    <div
      className="grid grid-cols-[minmax(0,1fr)]"
      style={{ paddingTop: Math.min(visible.length - 1, stack.peekCount) * stack.peekOffset }}
    >
      <AnimatePresence initial={false}>
        {visible.map((banner, depth) => (
          <motion.div
            key={banner.id}
            aria-hidden={depth > 0}
            className="col-start-1 row-start-1 min-w-0 origin-top"
            style={{ zIndex: visible.length - depth, pointerEvents: depth === 0 ? "auto" : "none" }}
            initial={{ opacity: 0, y: -depth * stack.peekOffset - dismiss.enterOffsetY }}
            animate={{
              opacity: 1,
              y: -depth * stack.peekOffset,
              scale: 1 - depth * stack.peekScaleStep,
              rotate: 0,
            }}
            exit={{ opacity: 0, y: dismiss.exitOffsetY, rotate: dismiss.exitRotate, zIndex: visible.length + 1 }}
            transition={transition}
          >
            <div
              role={banner.long_description ? "button" : undefined}
              tabIndex={banner.long_description ? 0 : undefined}
              onClick={() => banner.long_description && openDetails(banner.id)}
              onKeyDown={(e) =>
                e.target === e.currentTarget && e.key === "Enter" && banner.long_description && openDetails(banner.id)
              }
              className={cn(
                "flex flex-col gap-2 border bg-sidebar-accent shadow-md overflow-hidden text-xs",
                banner.long_description && "cursor-pointer hover:border-muted-foreground/40 transition-colors"
              )}
              style={{ borderRadius: card.radius, padding: card.padding }}
            >
              {card.showImage && (
                <img
                  src={withBasePath(banner.image_src)}
                  alt=""
                  className="w-full object-cover object-top rounded border"
                  style={{ height: card.imageHeight, borderRadius: Math.max(card.radius - 4, 0) }}
                />
              )}
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-sm text-foreground truncate">{banner.title}</span>
                {card.showOpenSourceBadge && banner.open_source && (
                  <Badge variant="outline" className="px-1 py-0 text-[10px] font-normal shrink-0">
                    OSS
                  </Badge>
                )}
              </div>
              {card.showDescription && <p className="text-muted-foreground leading-snug">{banner.description}</p>}
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground/70">{banner.long_description ? "Learn more →" : ""}</span>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-6 px-2 text-xs"
                  onClick={(e) => {
                    e.stopPropagation();
                    acknowledge(banner.id);
                  }}
                >
                  {card.acknowledgeLabel}
                </Button>
              </div>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};

export default StackedDeck;
