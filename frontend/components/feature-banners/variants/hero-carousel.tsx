"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";

import { type FeatureBanner } from "@/lib/feature-banners/types";
import { cn, withBasePath } from "@/lib/utils";

import { type FeatureBannerDials, toMotionTransition } from "../dials";
import { useFeatureBannerStore } from "../store";

interface VariantProps {
  banners: FeatureBanner[];
  dials: FeatureBannerDials;
}

// Variant B: one full-bleed image card with text overlaid; dots browse without acknowledging.
const HeroCarousel = ({ banners, dials }: VariantProps) => {
  const acknowledge = useFeatureBannerStore((s) => s.acknowledge);
  const openDetails = useFeatureBannerStore((s) => s.openDetails);
  const [index, setIndex] = useState(0);
  const { card, dismiss, hero } = dials;
  const transition = toMotionTransition(dismiss.transition);

  const current = banners[Math.min(index, banners.length - 1)];
  if (!current) return null;

  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative overflow-hidden" style={{ borderRadius: card.radius }}>
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: -dismiss.enterOffsetY }}
            animate={{ opacity: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, y: dismiss.exitOffsetY, rotate: dismiss.exitRotate }}
            transition={transition}
            role={current.long_description ? "button" : undefined}
            tabIndex={current.long_description ? 0 : undefined}
            onClick={() => current.long_description && openDetails(current.id)}
            onKeyDown={(e) =>
              e.target === e.currentTarget && e.key === "Enter" && current.long_description && openDetails(current.id)
            }
            className={cn(
              "relative flex flex-col justify-end border bg-sidebar-accent overflow-hidden text-xs",
              current.long_description && "cursor-pointer"
            )}
            style={{ borderRadius: card.radius, minHeight: card.showImage ? card.imageHeight + 64 : undefined }}
          >
            {card.showImage && (
              <img
                src={withBasePath(current.image_src)}
                alt=""
                className="absolute inset-0 size-full object-cover object-top"
              />
            )}
            <div
              className="absolute inset-0 bg-gradient-to-t from-sidebar-accent via-sidebar-accent/70 to-transparent"
              style={{ opacity: hero.overlayOpacity }}
            />
            <button
              aria-label={card.acknowledgeLabel}
              title={card.acknowledgeLabel}
              onClick={(e) => {
                e.stopPropagation();
                acknowledge(current.id);
              }}
              className="absolute top-1.5 right-1.5 rounded-full bg-background/70 backdrop-blur p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3" />
            </button>
            <div className="relative flex flex-col gap-0.5" style={{ padding: card.padding }}>
              <span className="text-[10px] uppercase tracking-wide text-primary font-medium">
                New{card.showOpenSourceBadge && current.open_source ? " · Open source" : ""}
              </span>
              <span className="font-medium text-sm text-foreground">{current.title}</span>
              {card.showDescription && <p className="text-secondary-foreground leading-snug">{current.description}</p>}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
      {hero.showDots && banners.length > 1 && (
        <div className="flex justify-center gap-1">
          {banners.map((b, i) => (
            <button
              key={b.id}
              aria-label={`Show ${b.title}`}
              onClick={() => setIndex(i)}
              className={cn(
                "h-1.5 rounded-full transition-all",
                b.id === current.id ? "w-4 bg-foreground/70" : "w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default HeroCarousel;
