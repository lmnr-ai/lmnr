import { LogoAxionRay, LogoBrowserUse, LogoOpenHands, LogoPassionfroot, LogoRye } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

const LOGOS = [
  { id: "browser-use", Component: LogoBrowserUse, className: "w-32 h-8" },
  { id: "rye", Component: LogoRye, className: "w-16 h-5" },
  { id: "axion-ray", Component: LogoAxionRay, className: "w-24 h-8" },
  { id: "openhands", Component: LogoOpenHands, className: "w-28 h-7" },
  { id: "passionfroot", Component: LogoPassionfroot, className: "w-28 h-7" },
];

const LogoStrip = ({ className }: Props) => (
  <div className={cn("grid grid-cols-2 md:grid-cols-5 gap-2", className)}>
    {LOGOS.map(({ id, Component, className: logoClassName }) => (
      <div key={id} className="flex items-center justify-center h-13 rounded bg-landing-surface-600 flex-1">
        <Component className={cn("opacity-50", logoClassName)} />
      </div>
    ))}
  </div>
);

export default LogoStrip;
