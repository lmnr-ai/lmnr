import { LogoAxionRay, LogoBrowserUse, LogoOpenHands, LogoRye } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const LOGOS = [
  { id: "browser-use", component: LogoBrowserUse, className: "w-32 h-8" },
  { id: "rye", component: LogoRye, className: "w-16 h-5" },
  { id: "axion-ray", component: LogoAxionRay, className: "w-24 h-8" },
  { id: "openhands", component: LogoOpenHands, className: "w-28 h-7" },
];

const CustomerLogoStrip = ({ className }: { className?: string }) => (
  <div className={cn("grid grid-cols-2 md:grid-cols-4 gap-2 w-full", className)}>
    {LOGOS.map((logo) => {
      const Logo = logo.component;
      return (
        <div key={logo.id} className="flex items-center justify-center h-12 rounded bg-landing-surface-700">
          <Logo className={cn("opacity-50", logo.className)} />
        </div>
      );
    })}
  </div>
);

export default CustomerLogoStrip;
