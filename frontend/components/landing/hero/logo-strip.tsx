import {
  LogoAxionRay,
  LogoBrowserUse,
  LogoKnot,
  LogoOpenHands,
  LogoPassionfroot,
  LogoRye,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const LOGOS = [
  {
    id: "browser-use",
    Component: LogoBrowserUse,
    className: "w-[102px] h-[26px] sm:w-32 sm:h-8",
    href: "https://browser-use.com",
  },
  {
    id: "openhands",
    Component: LogoOpenHands,
    className: "w-[90px] h-[22px] sm:w-28 sm:h-7",
    href: "https://www.all-hands.dev",
  },
  { id: "rye", Component: LogoRye, className: "w-[51px] h-4 sm:w-16 sm:h-5", href: "https://rye.com" },
  {
    id: "axion-ray",
    Component: LogoAxionRay,
    className: "w-[77px] h-[26px] sm:w-24 sm:h-8",
    href: "https://www.axionray.com",
  },
  {
    id: "passionfroot",
    Component: LogoPassionfroot,
    className: "w-[90px] h-[22px] sm:w-28 sm:h-7",
    href: "https://www.passionfroot.me",
  },
  { id: "knot", Component: LogoKnot, className: "w-[43px] h-4 sm:w-[54px] sm:h-5", href: "https://www.knotapi.com" },
];

const LogoStrip = ({ className }: Props) => (
  <div className={cn("grid grid-cols-3 md:grid-cols-6 gap-1 sm:gap-2 w-full max-w-[960px]", className)}>
    {LOGOS.map(({ id, Component, className: logoClassName, href }) => (
      <a
        key={id}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-center h-10 sm:h-13 rounded bg-surface-500 transition-colors hover:bg-surface-400"
      >
        <Component className={cn("opacity-50 scale-90 transition-opacity group-hover:opacity-80", logoClassName)} />
      </a>
    ))}
  </div>
);

export default LogoStrip;
