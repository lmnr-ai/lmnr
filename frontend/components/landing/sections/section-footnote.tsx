import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

interface Props {
  step: string;
  name: string;
  href: string;
}

// Absolutely-positioned label that sits at the bottom of a mock panel
// (a surface-550 wrapper). The parent must be `relative`. Pattern:
//
//   <div className="bg-landing-surface-550 relative ...">
//     <Mock />
//     <SectionFootnote step="05" name="Evals" href="..." />
//   </div>
const SectionFootnote = ({ step, name, href }: Props) => (
  <div className="absolute bottom-0 left-0 right-0 z-20 flex justify-between w-full px-2 py-2 text-xs text-landing-text-400 tracking-wider">
    <span className="flex gap-2">
      <span>{step}.</span>
      <span>{name.toUpperCase()}</span>
    </span>
    <Link
      href={href}
      target="_blank"
      className="inline-flex items-center gap-1 hover:text-landing-text-300 transition-colors"
    >
      LEARN MORE
      <ArrowUpRight className="size-3" strokeWidth={2} />
    </Link>
  </div>
);

export default SectionFootnote;
