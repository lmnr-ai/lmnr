import Link from "next/link";

import { cn } from "@/lib/utils";

interface CTA {
  label: string;
  href: string;
}

interface BottomCTAProps {
  title: string;
  description?: string;
  primaryCta: CTA;
  secondaryCta?: CTA;
  className?: string;
}

export default function BottomCTA({ title, description, primaryCta, secondaryCta, className }: BottomCTAProps) {
  return (
    <section
      className={cn("w-full py-16 md:py-24 bg-landing-surface-700 border-y border-landing-surface-500", className)}
    >
      <div className="max-w-3xl mx-auto px-4 flex flex-col items-center text-center gap-6">
        <h2 className="font-space-grotesk text-3xl md:text-4xl tracking-tight text-landing-text-100">{title}</h2>
        {description && <p className="text-landing-text-300 max-w-xl">{description}</p>}
        <div className="mt-2 flex flex-col sm:flex-row gap-3">
          <Link
            href={primaryCta.href}
            className="inline-flex items-center justify-center rounded-sm bg-landing-primary-400 px-6 py-2.5 text-sm font-medium text-white border border-white/40 transition-colors hover:bg-landing-primary-300"
          >
            {primaryCta.label}
          </Link>
          {secondaryCta && (
            <Link
              href={secondaryCta.href}
              className="inline-flex items-center justify-center rounded-sm border border-landing-text-600 px-6 py-2.5 text-sm font-medium text-landing-text-200 transition-colors hover:text-landing-text-100 hover:border-landing-text-400"
            >
              {secondaryCta.label}
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}
