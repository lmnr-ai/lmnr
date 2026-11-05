"use client";

import { AlertCircle, ArrowRight, Info } from "lucide-react";
import Link from "next/link";

import { getLicenseBannerMessage } from "@/components/license/license-message";
import { useProjectContext } from "@/contexts/project-context";
import { type LicenseStatus } from "@/lib/license/types";
import { cn } from "@/lib/utils";

const TONE_CLASSES = {
  info: { container: "bg-primary/5 hover:bg-primary/10", icon: "text-primary" },
  warning: { container: "bg-primary/5 hover:bg-primary/10", icon: "text-primary" },
  critical: { container: "bg-destructive/10 hover:bg-destructive/20", icon: "text-destructive" },
};

export default function LicenseBanner({ license }: { license: LicenseStatus }) {
  const { settingsHref } = useProjectContext();
  const message = getLicenseBannerMessage(license);

  if (!message) {
    return null;
  }

  const tone = TONE_CLASSES[message.tone];
  const Icon = message.tone === "info" ? Info : AlertCircle;

  return (
    <div className={cn("flex items-center w-full transition-colors", tone.container)}>
      <Link href={settingsHref("license")} className="flex flex-1 items-center gap-3 px-4 py-2 min-w-0">
        <Icon className={cn("flex-shrink-0", tone.icon)} size={16} />
        <div className="flex-1 flex items-center justify-between gap-4 min-w-0">
          <span className="text-xs text-foreground/90">{message.text}</span>
          <div className="flex flex-shrink-0 items-center gap-1 text-xs font-medium text-foreground/70 hover:text-foreground transition-colors">
            <span>{message.cta}</span>
            <ArrowRight size={14} />
          </div>
        </div>
      </Link>
    </div>
  );
}
