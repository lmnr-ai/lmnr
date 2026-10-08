import { LogoBrowserUse, LogoMetaforms, LogoOpenHands, LogoPassionfroot, LogoVorflux } from "@/components/ui/icons";
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
  {
    id: "metaforms",
    Component: LogoMetaforms,
    className: "w-[94px] h-3 sm:w-[125px] sm:h-4",
    href: "https://www.metaforms.ai",
  },
  {
    id: "vorflux",
    Component: LogoVorflux,
    className: "w-[92px] h-[19px] sm:w-[113px] sm:h-[23px]",
    href: "https://vorflux.com",
  },
  {
    id: "passionfroot",
    Component: LogoPassionfroot,
    className: "w-[90px] h-[22px] sm:w-28 sm:h-7",
    href: "https://www.passionfroot.me",
  },
];

// Below md the 5 logos wrap 3 + 2; a 6-col grid with 2-col cells lets the second row start at col 2 and sit centered.
const LogoStrip = ({ className }: Props) => (
  <div className={cn("grid grid-cols-6 md:grid-cols-5 gap-1 sm:gap-2 w-full max-w-[960px]", className)}>
    {LOGOS.map(({ id, Component, className: logoClassName, href }) => (
      <a
        key={id}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="group col-span-2 md:col-span-1 nth-4:col-start-2 md:nth-4:col-start-auto flex items-center justify-center h-10 sm:h-13 rounded bg-surface-250 transition-colors hover:bg-surface-300"
      >
        <Component className={cn("opacity-50 scale-90 transition-opacity group-hover:opacity-80", logoClassName)} />
      </a>
    ))}
  </div>
);

export default LogoStrip;
