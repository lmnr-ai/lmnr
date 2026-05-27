import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { subSection } from "../../class-names";
import Terminal from "./terminal";

interface Feature {
  label: string;
  href?: string;
}

const FEATURES: Feature[] = [
  { label: "Fully open-source", href: "https://github.com/lmnr-ai/lmnr" },
  { label: "Apache 2.0 license", href: "https://github.com/lmnr-ai/lmnr?tab=Apache-2.0-1-ov-file#readme" },
  { label: "Set up with Docker in three lines", href: "https://laminar.sh/docs/hosting-options" },
  { label: "Deploy anywhere with Helm Charts" },
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

const OpenSource = () => (
  <section className="flex flex-col items-start gap-10 w-full">
    <div className="flex flex-col md:flex-row gap-10 items-start w-full">
      {/* LEFT — existing feature rows. */}
      <div className="flex flex-col w-full md:w-[320px] md:min-w-0">
        <h2 className={cn(subSection, "mb-13")}>Self-host anywhere</h2>
        {FEATURES.map((f) => (
          <FeatureRow key={f.label} {...f} />
        ))}
      </div>

      {/* RIGHT — terminal visualization panel. The inner box is the actual
          terminal canvas; the surface-550 wrapper is the visual container. */}
      <div className="w-full md:flex-1 md:min-w-0 bg-landing-surface-550 flex items-center justify-center p-5 overflow-hidden h-[400px]">
        <div className="bg-landing-surface-700 rounded w-[420px] max-w-full px-6 py-5">
          <Terminal />
        </div>
      </div>
    </div>
  </section>
);

export default OpenSource;
