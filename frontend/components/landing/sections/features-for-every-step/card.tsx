import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { type ComponentType } from "react";

import CardHoverGlow from "../card-hover-glow";
import { type CardCopy } from "./cards";

interface Props extends CardCopy {
  Graphic: ComponentType;
}

// Tall narrow card: copy on top, graphic filling the rest. The graphic frame is
// `overflow-hidden` and has no padding, so a graphic may bleed off any edge —
// that crop is what sells it as a slice of the real product.
const Card = ({ Icon, title, description, href, Graphic }: Props) => (
  <Link
    target="_blank"
    aria-label={`Learn more about ${title}`}
    href={href}
    className="group bg-surface-250 font-sans-landing relative overflow-hidden flex flex-col h-[420px] rounded transition-all duration-300 hover:bg-surface-300"
  >
    <CardHoverGlow />
    <div className="relative flex flex-col gap-2 px-5 pt-5 pb-4">
      <div className="flex items-start justify-between w-full">
        <Icon className="size-5 text-foreground-300" strokeWidth={1.5} />
        <ArrowUpRight className="size-5 text-foreground-300" strokeWidth={1.5} />
      </div>
      <p className="leading-6 text-white text-lg mt-1">{title}</p>
      <p className="text-sm leading-5 text-foreground-200">{description}</p>
    </div>
    <div className="relative flex-1 overflow-hidden">
      <Graphic />
    </div>
  </Link>
);

export default Card;
