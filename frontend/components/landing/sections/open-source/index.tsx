import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { subSection } from "../../class-names";
import SectionFootnote from "../section-footnote";
import GitHubStarsLabel from "./github-stars-label";
import Terminal from "./terminal";

interface Feature {
  /** Stable list key. `label` is a node and two rows share an href, so neither
   *  can serve as one. */
  id: string;
  label: ReactNode;
  href?: string;
}

const FEATURES: Feature[] = [
  { id: "stars", label: <GitHubStarsLabel />, href: "https://github.com/lmnr-ai/lmnr" },
  {
    id: "license",
    label: "Apache 2.0 license",
    href: "https://github.com/lmnr-ai/lmnr?tab=Apache-2.0-1-ov-file#readme",
  },
  {
    id: "docker",
    label: "Set up with Docker with single command",
    href: "https://laminar.sh/docs/hosting-options",
  },
  {
    id: "helm",
    label: "Deploy on AWS or GCP with Helm charts",
    href: "https://laminar.sh/docs/hosting-options",
  },
];

// The rule sits on TOP of each row, so the list opens with one under the
// heading and closes flush — no trailing rule to clear.
const FeatureRow = ({ label, href }: Feature) => {
  const inner = (
    <>
      <p className="text-lg leading-6 text-foreground-300">{label}</p>
      {href && <ArrowUpRight className="size-4 text-foreground-300 shrink-0" strokeWidth={2} />}
    </>
  );
  const className = "flex items-center gap-3 h-14 w-full border-t border-foreground-600";
  return href ? (
    <Link href={href} target="_blank" className={`${className} hover:text-foreground-50 transition-colors`}>
      {inner}
    </Link>
  ) : (
    <div className={className}>{inner}</div>
  );
};

const OpenSource = () => (
  <section className="flex flex-col items-start gap-10 w-full">
    <h2 className={subSection}>Open-source from day zero</h2>

    <div className="flex flex-col md:flex-row gap-10 items-start w-full">
      {/* LEFT — the feature rows. Fixed 380 rather than a fraction: the rows
          are a rule-separated list, so a width that reflows with the viewport
          would restack their labels at awkward points. */}
      <div className="flex flex-col w-full md:w-[380px] md:min-w-0">
        {FEATURES.map((f) => (
          <FeatureRow key={f.id} {...f} />
        ))}
      </div>

      {/* RIGHT — terminal visualization panel, unchanged but for its height.
          Centered when there's room; overflows left-anchored otherwise (same
          pattern as did-my-fix). On mobile the inner is scaled to 80% from the
          left edge so it fits tighter viewports without horizontal scrolling. */}
      <div className="w-full md:flex-1 md:min-w-0 bg-surface-500 relative flex items-center p-5 overflow-hidden h-[392px]">
        <div className="shrink-0 mx-auto md:scale-none scale-[80%] origin-left">
          <div className="bg-surface-700 rounded w-[420px] px-6 py-5">
            <Terminal />
          </div>
        </div>
        <SectionFootnote name="Self-hosting" href="https://laminar.sh/docs/hosting-options" />
      </div>
    </div>
  </section>
);

export default OpenSource;
