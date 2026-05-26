import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { subSection } from "../class-names";

interface Feature {
  label: string;
  href?: string;
}

const FEATURES: Feature[] = [
  { label: "Fully open-source, Apache 2.0 licensed", href: "https://github.com/lmnr-ai/lmnr" },
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
    <h2 className={cn(subSection, "mb-2")}>Self-host anywhere</h2>

    <div className="flex flex-col w-full">
      {FEATURES.map((f) => (
        <FeatureRow key={f.label} {...f} />
      ))}
    </div>
  </section>
);

export default OpenSource;
