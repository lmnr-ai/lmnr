import { ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { subSection } from "../class-names";

// Feature rows in the two-column grid. Items with `href` render as docs
// links with an ArrowUpRight glyph; the rest are plain statements.
interface Feature {
  label: string;
  href?: string;
}

const FEATURES_LEFT: Feature[] = [
  { label: "Blazing fast, written in Rust" },
  { label: "Terabytes of production data with ease" },
  { label: "Full-text search on all data" },
];

// FLAG: there is no docs page for Helm charts (and no Helm chart in the
// repo) as of writing — `hosting-options` only covers Docker Compose.
// Both Docker + Helm rows currently point at the same hosting-options
// page. If you ship a real Helm chart, swap the URL here.
const FEATURES_RIGHT: Feature[] = [
  { label: "Fully open-source, Apache 2.0 licensed" },
  { label: "Set up with Docker in three lines", href: "https://laminar.sh/docs/hosting-options" },
  { label: "Deploy anywhere with Helm Charts", href: "https://laminar.sh/docs/hosting-options" },
];

const FeatureRow = ({ label, href }: Feature) => {
  const inner = (
    <>
      <p className="text-lg leading-6 text-landing-text-300">{label}</p>
      {href && <ArrowUpRight className="size-4 text-landing-text-300 shrink-0" strokeWidth={2} />}
    </>
  );
  const className = "flex items-center gap-3 h-14 w-full border-t border-landing-text-600";
  return href ? (
    <Link href={href} target="_blank" className={`${className} hover:text-landing-text-100 transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
};

const BuiltForProduction = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>Built for production</h2>

    {/* Hero metric + visual comparison. Side-by-side at md+; stacked
        (20x above bars) on mobile. items-end only applies at md+ so the
        "20x" subtitle and Laminar label share a baseline horizontally. */}
    <div className="flex flex-col gap-8 md:flex-row md:items-end md:gap-[52px] w-full">
      <div className="flex flex-col gap-1 items-start justify-end shrink-0">
        <p className="font-manrope font-medium text-white text-[60px] leading-[60px] tracking-[-0.02em]">20x</p>
        <p className="text-sm text-landing-text-300">trace compression ratio</p>
      </div>
      <div className="flex-1 min-w-0 flex flex-col gap-1 items-start">
        <div className="bg-landing-surface-500 flex items-center justify-end w-full h-8 px-3">
          <p className="text-sm text-landing-text-300">Competition</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="bg-landing-primary-400 h-8 w-[34px]" />
          <p className="text-sm text-white">Laminar</p>
        </div>
      </div>
    </div>

    {/* Two-column feature grid. Each row is 56px tall with a top border.
        Stacks to one column on mobile. */}
    <div className="flex flex-col md:flex-row md:items-start md:gap-10 w-full">
      <div className="flex flex-col flex-1 min-w-0 items-start">
        {FEATURES_LEFT.map((f) => (
          <FeatureRow key={f.label} {...f} />
        ))}
      </div>
      <div className="flex flex-col flex-1 min-w-0 items-start">
        {FEATURES_RIGHT.map((f) => (
          <FeatureRow key={f.label} {...f} />
        ))}
      </div>
    </div>

    {/* Compliance block — left-aligned, tighter learn-more than the
        section's previous LearnMoreLink-style link (12px + ArrowRight). */}
    <div className="flex flex-col gap-6 items-start">
      <p className="text-lg leading-6 text-landing-text-300">HIPAA, SOC 2 Type 2 compliant</p>
      <div className="flex flex-col gap-4 items-start">
        <div className="flex items-center gap-6">
          <Image src="/assets/landing/hipaa.svg" alt="HIPAA compliant" width={84} height={84} className="size-[84px]" />
          <Image
            src="/assets/landing/soc2.svg"
            alt="SOC 2 Type 2 compliant"
            width={84}
            height={84}
            className="size-[84px]"
          />
        </div>
        <Link
          href="https://compliance.laminar.sh/"
          target="_blank"
          className="inline-flex items-center gap-1 text-xs text-landing-text-300 hover:text-landing-text-100 transition-colors"
        >
          Compliance
          <ArrowRight className="size-3" strokeWidth={2} />
        </Link>
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
