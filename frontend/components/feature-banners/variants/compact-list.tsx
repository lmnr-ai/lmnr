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

const MAX_ROWS = 3;

// Variant C: a "What's new" group of compact rows; hovering a row expands its image.
const CompactList = ({ banners, dials }: VariantProps) => {
  const acknowledge = useFeatureBannerStore((s) => s.acknowledge);
  const openDetails = useFeatureBannerStore((s) => s.openDetails);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const { card, dismiss, compact } = dials;
  const transition = toMotionTransition(dismiss.transition);
  const rows = banners.slice(0, MAX_ROWS);

  return (
    <div className="flex flex-col border bg-sidebar-accent overflow-hidden" style={{ borderRadius: card.radius }}>
      <div className="flex items-center justify-between px-2 pt-1.5 pb-1 text-[11px] text-muted-foreground">
        <span className="font-medium">What&apos;s new</span>
        <span>{banners.length}</span>
      </div>
      <AnimatePresence initial={false} mode="popLayout">
        {rows.map((banner) => {
          const expanded = card.showImage && compact.expandOnHover && hoveredId === banner.id;
          return (
            <motion.div
              layout
              key={banner.id}
              initial={{ opacity: 0, y: dismiss.enterOffsetY }}
              animate={{ opacity: 1, y: 0, rotate: 0 }}
              exit={{ opacity: 0, y: dismiss.exitOffsetY, rotate: dismiss.exitRotate }}
              transition={transition}
              onHoverStart={() => setHoveredId(banner.id)}
              onHoverEnd={() => setHoveredId((id) => (id === banner.id ? null : id))}
              role={banner.long_description ? "button" : undefined}
              tabIndex={banner.long_description ? 0 : undefined}
              onClick={() => banner.long_description && openDetails(banner.id)}
              onKeyDown={(e) =>
                e.target === e.currentTarget && e.key === "Enter" && banner.long_description && openDetails(banner.id)
              }
              className={cn(
                "group relative border-t text-xs bg-sidebar-accent",
                banner.long_description && "cursor-pointer hover:bg-muted/60"
              )}
              style={{ padding: card.padding / 1.5 }}
            >
              <div className="flex items-start gap-2 pr-4">
                {card.showImage && !expanded && (
                  <motion.img
                    layoutId={`${banner.id}-image`}
                    src={withBasePath(banner.image_src)}
                    alt=""
                    className="shrink-0 rounded object-cover object-top border"
                    style={{ width: compact.thumbSize, height: compact.thumbSize }}
                  />
                )}
                <div className="flex flex-col min-w-0">
                  <span className="font-medium text-foreground truncate">
                    {banner.title}
                    {card.showOpenSourceBadge && banner.open_source && (
                      <span className="ml-1 font-normal text-muted-foreground">· OSS</span>
                    )}
                  </span>
                  {card.showDescription && (
                    <span className={cn("text-muted-foreground leading-snug", !expanded && "line-clamp-2")}>
                      {banner.description}
                    </span>
                  )}
                </div>
              </div>
              {expanded && (
                <motion.img
                  layoutId={`${banner.id}-image`}
                  src={withBasePath(banner.image_src)}
                  alt=""
                  className="mt-2 w-full rounded object-cover object-top border"
                  style={{ height: card.imageHeight }}
                />
              )}
              <button
                aria-label={card.acknowledgeLabel}
                title={card.acknowledgeLabel}
                onClick={(e) => {
                  e.stopPropagation();
                  acknowledge(banner.id);
                }}
                className="absolute top-1.5 right-1.5 text-muted-foreground opacity-60 hover:opacity-100 hover:text-foreground"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

export default CompactList;
