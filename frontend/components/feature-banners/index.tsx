"use client";

// Prototype: three variants of the sidebar feature banner, switchable via `?bannerVariant=` on any
// project page. Banners are mocks and acknowledgments are in-memory until the data source is decided.
import "dialkit/styles.css";
import { DialRoot } from "dialkit";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useShallow } from "zustand/react/shallow";

import PrototypeSwitcher from "@/components/common/prototype-switcher";
import { useSidebar } from "@/components/ui/sidebar";

import FeatureBannerDetailsDialog from "./details-dialog";
import { useFeatureBannerDials } from "./dials";
import { selectVisibleBanners, useFeatureBannerStore } from "./store";
import CompactList from "./variants/compact-list";
import HeroCarousel from "./variants/hero-carousel";
import StackedDeck from "./variants/stacked-deck";

const VARIANTS = [
  { key: "A", label: "Stacked deck", Component: StackedDeck },
  { key: "B", label: "Hero carousel", Component: HeroCarousel },
  { key: "C", label: "Compact list", Component: CompactList },
] as const;

const VARIANT_KEYS = VARIANTS.map((v) => v.key);

const FeatureBanners = () => {
  const { open, openMobile } = useSidebar();
  const [variant] = useQueryState("bannerVariant", parseAsStringLiteral(VARIANT_KEYS).withDefault("A"));
  const banners = useFeatureBannerStore(useShallow(selectVisibleBanners));
  const dials = useFeatureBannerDials();

  const { Component } = VARIANTS.find((v) => v.key === variant) ?? VARIANTS[0];

  return (
    <>
      {(open || openMobile) && banners.length > 0 && (
        <div className="px-2 pb-1">
          <Component banners={banners} dials={dials} />
        </div>
      )}
      <FeatureBannerDetailsDialog dials={dials} />
      <PrototypeSwitcher param="bannerVariant" variants={VARIANTS.map(({ key, label }) => ({ key, label }))} />
      {process.env.NODE_ENV !== "production" && <DialRoot position="bottom-right" defaultOpen={false} />}
    </>
  );
};

export default FeatureBanners;
