import { LogoAxionRay, LogoBrowserUse, LogoOpenHands, LogoRye } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
}

// Hero logo strip per figma `Frame 1183` (4200:55230). Four 80×49 tiles in
// a left-anchored row with a 32px gap — no boxes, no full-width grid. Logos
// themselves are scaled +15% relative to the figma reference per visual
// tuning (the figma-spec dims looked too quiet at the final render size).
const LOGOS = [
  { id: "browser-use", Component: LogoBrowserUse, className: "w-[92px] h-[23px]" },
  { id: "rye", Component: LogoRye, className: "w-[64px] h-[18px]" },
  { id: "axion-ray", Component: LogoAxionRay, className: "w-[92px] h-[28px]" },
  { id: "openhands", Component: LogoOpenHands, className: "w-[92px] h-[23px]" },
];

const LogoStrip = ({ className }: Props) => (
  <div className={cn("flex flex-row gap-8 items-center", className)}>
    {LOGOS.map(({ id, Component, className: logoClassName }) => (
      <div key={id} className="flex items-center justify-start w-[92px] h-[56px]">
        <Component className={cn("opacity-50", logoClassName)} />
      </div>
    ))}
  </div>
);

export default LogoStrip;
