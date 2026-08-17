"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { ElevatedSurface } from "@/components/ui/surface";

import CardHoverGlow from "../card-hover-glow";
import { type CardDef } from "./cards";

/** Card's resting rung on the elevation ladder (surface-250); hover takes it to 6. */
const RESTING_ELEVATION = 5;

// Two masks intersected, so the mock dissolves on the two edges it overruns
// instead of ending on a hard cut. Same idea as the app's scroll-fade
// utilities, minus the scroll timeline. It bottoms out at 20% rather than 0:
// the mock should recede, not disappear.
const GRAPHIC_FADE =
  "[mask-image:linear-gradient(to_bottom,#000_calc(100%-56px),rgba(0,0,0,0.2)),linear-gradient(to_right,#000_calc(100%-80px),rgba(0,0,0,0.2))] [mask-composite:intersect]";

/** Fixed band at the foot of every card. Pinned rather than flexed, so the
 *  graphics all start on the same line no matter how tall the copy above ran. */
const GRAPHIC_H = 220;

// Tall narrow card: header and copy at the top, graphic in the band at the
// bottom. Header follows ../compliance — title on the row with the arrow, no
// icon. The band has no padding of its own, so a graphic may bleed off any
// edge; that crop is what sells it as a slice of the real product.
//
// Elevation, not a hardcoded fill: hovering raises the card one rung, and every
// panel inside is painted with a RELATIVE surface utility (`bg-surface-down`,
// `border-surface-up-2`, …), so the whole mock re-paints in step and keeps its
// contrast at both rungs. `**:transition-colors` is what makes the descendants
// ride the same 300ms as the card instead of snapping.
const Card = ({ title, description, href, Graphic }: CardDef) => {
  const [raised, setRaised] = useState(false);

  return (
    <ElevatedSurface asChild level={raised ? RESTING_ELEVATION + 1 : RESTING_ELEVATION}>
      <Link
        target="_blank"
        aria-label={`Learn more about ${title}`}
        href={href}
        onMouseEnter={() => setRaised(true)}
        onMouseLeave={() => setRaised(false)}
        onFocus={() => setRaised(true)}
        onBlur={() => setRaised(false)}
        className="group font-sans-landing relative overflow-hidden flex flex-col h-[420px] rounded transition-colors duration-300 [--card-glow-opacity:0.3]"
      >
        <CardHoverGlow />
        <div className="relative flex flex-col gap-2.5 pl-6 pr-5 pt-5">
          <div className="flex items-start justify-between gap-3 w-full">
            <p className="leading-6 text-white text-lg">{title}</p>
            <ArrowUpRight className="size-5 shrink-0 text-foreground-300" strokeWidth={1.5} />
          </div>
          <p className="text-foreground-200">{description}</p>
        </div>
        <div
          style={{ height: GRAPHIC_H }}
          className={`relative mt-auto shrink-0 overflow-hidden opacity-70 **:transition-colors **:duration-300 ${GRAPHIC_FADE}`}
        >
          <Graphic />
        </div>
      </Link>
    </ElevatedSurface>
  );
};

export default Card;
