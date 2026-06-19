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
  { id: "browser-use", Component: LogoBrowserUse, className: "w-32 h-8", href: "https://browser-use.com" },
  { id: "openhands", Component: LogoOpenHands, className: "w-28 h-7", href: "https://www.all-hands.dev" },
  { id: "rye", Component: LogoRye, className: "w-16 h-5", href: "https://rye.com" },
  { id: "axion-ray", Component: LogoAxionRay, className: "w-24 h-8", href: "https://www.axionray.com" },
  { id: "passionfroot", Component: LogoPassionfroot, className: "w-28 h-7", href: "https://www.passionfroot.me" },
  { id: "knot", Component: LogoKnot, className: "w-[54px] h-5", href: "https://www.knotapi.com" },
];

const LogoStrip = ({ className }: Props) => (
  <div className={cn("grid grid-cols-3 md:grid-cols-6 gap-2 w-full max-w-[960px]", className)}>
    {LOGOS.map(({ id, Component, className: logoClassName, href }) => (
      <a
        key={id}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center justify-center h-13 rounded bg-surface-500 transition-colors hover:bg-surface-400"
      >
        <Component className={cn("opacity-50 scale-90 transition-opacity group-hover:opacity-80", logoClassName)} />
      </a>
    ))}
  </div>
);

export default LogoStrip;
