import { Book, CalendarDays } from "lucide-react";
import Link from "next/link";

import laminarWordmark from "@/assets/logo/laminar-wordmark.svg";
import VersionBadge from "@/components/common/version-badge";
import { Button } from "@/components/ui/button";
import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { cn } from "@/lib/utils";

const linkClassName =
  "h-6 gap-1.5 px-2 text-xs text-foreground-400 hover:bg-emphasis-1 hover:text-secondary-foreground active:bg-emphasis-2 [&_svg]:size-3.5";

export default function BottomBarLinks() {
  const features = useFeatureFlags();
  // VersionBadge renders nothing without a baked-in version, so mirror its check for the logo spacing.
  const showVersion = !features.LAMINAR_CLOUD && !!process.env.NEXT_PUBLIC_APP_VERSION;

  return (
    <div className="flex items-center gap-1">
      <Link href="/projects" aria-label="Laminar" className={cn("flex items-center pl-2", { "mr-3": !showVersion })}>
        {/* mask + bg tint: the SVG is hard fill="white", so next/image can't be recolored */}
        <span
          className="block w-19 -translate-x-1 -translate-y-[1.5px] bg-secondary-foreground/40"
          style={{
            maskImage: `url(${laminarWordmark.src})`,
            WebkitMaskImage: `url(${laminarWordmark.src})`,
            maskRepeat: "no-repeat",
            WebkitMaskRepeat: "no-repeat",
            maskSize: "contain",
            WebkitMaskSize: "contain",
            aspectRatio: `${laminarWordmark.width} / ${laminarWordmark.height}`,
          }}
        />
      </Link>
      {showVersion && <VersionBadge className="mr-6 -ml-0.5 -translate-y-[0.5px] font-sans text-[13px]" />}
      <Button asChild variant="ghost" size="sm" className={linkClassName}>
        <Link href="https://laminar.sh/docs" target="_blank" rel="noopener noreferrer">
          <Book />
          Docs
        </Link>
      </Button>
      <Button asChild variant="ghost" size="sm" className={linkClassName}>
        <Link href="https://cal.com/robert-lmnr/demo" target="_blank" rel="noopener noreferrer">
          <CalendarDays />
          Book a demo
        </Link>
      </Button>
    </div>
  );
}
