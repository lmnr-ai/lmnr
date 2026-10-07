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
  "[mask-image:linear-gradient(to_bottom,#000_calc(100%-56px),rgba(0,0,0,0.2)),linear-gradient(to_right,#000_calc(100%-120px),rgba(0,0,0,0.2))] [mask-composite:intersect]";

/** Fixed band at the foot of every card. Pinned rather than flexed, so the
 *  graphics all start on the same line no matter how tall the copy above ran. */
const GRAPHIC_H = 220;

/** Where the mocks start inside the band, and the one place all six align from.
 *  An offset positioned box, not padding: mocks are `absolute inset-0` and
 *  insets resolve against the PADDING box, so padding here would do nothing.
 *  Left and top only — they are meant to bleed off the bottom and the right. */
const GRAPHIC_INSET = "absolute left-7 top-3 right-0 bottom-0";

// Header and copy on top, graphic in the band below, bleeding off the bottom
// and right — that crop is what sells it as a slice of the real product.
// Elevation, not a hardcoded fill: hover raises the card a rung and the mock's
// RELATIVE surface utilities re-paint in step, on the card's own 300ms.
const Card = ({ title, description, href, Graphic }: CardDef) => {
  const [raised, setRaised] = useState(false);

  return (
    <ElevatedSurface asChild level={raised ? RESTING_ELEVATION + 1 : RESTING_ELEVATION}>
      <Link
        target="_blank"
        aria-label={`Learn more about ${title.replace(/\n/g, " ")}`}
        href={href}
        onMouseEnter={() => setRaised(true)}
        onMouseLeave={() => setRaised(false)}
        onFocus={() => setRaised(true)}
        onBlur={() => setRaised(false)}
        className="group font-sans-landing relative overflow-hidden flex flex-col h-[360px] rounded transition-colors duration-300 [--card-glow-opacity:0.3]"
      >
        <CardHoverGlow />
        <div className="relative flex flex-col gap-2.5 pl-8 pr-6 pt-6">
          <div className="flex items-start justify-between gap-3 w-full">
            <p className="leading-6 text-white text-lg whitespace-pre-line">{title}</p>
            <ArrowUpRight className="size-5 shrink-0 text-foreground-300" strokeWidth={1.5} />
          </div>
          <p className="text-foreground-200">{description}</p>
        </div>
        <div
          style={{ height: GRAPHIC_H }}
          className={`relative mt-auto shrink-0 overflow-hidden opacity-70 **:transition-colors **:duration-300 ${GRAPHIC_FADE}`}
        >
          <div className={GRAPHIC_INSET}>
            <Graphic />
          </div>
        </div>
      </Link>
    </ElevatedSurface>
  );
};

export default Card;
