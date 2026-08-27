import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { type ReactNode } from "react";

import { subSection } from "../class-names";
import CardHoverGlow from "./card-hover-glow";

interface CardProps {
  title: string;
  /** ReactNode so callers can pin the frame's line breaks. Our type sets a
   *  touch narrower than Figma's, so at 434 the natural wrap fits one more word
   *  per line than the design does. */
  description?: ReactNode;
  /** Rendered under the title instead of a description — the compliance card
   *  carries the two certification badges there. */
  children?: ReactNode;
  href: string;
}

// Shell borrowed from ./features-for-every-step, sized to the Figma frame. The
// 360px text measure is narrower than the card on purpose, so descriptions wrap
// where the design wraps them. Two requested departures: no icon (the title
// takes the top row beside the arrow) and no "Learn more" row.
const Card = ({ title, description, children, href }: CardProps) => (
  <Link
    target="_blank"
    aria-label={`Learn more about ${title}`}
    href={href}
    className="group bg-surface-250 font-sans-landing relative overflow-hidden flex flex-col h-[200px] pl-6 pr-5 py-5 gap-2.5 justify-start items-start rounded transition-all duration-300 hover:bg-surface-300"
  >
    <CardHoverGlow />
    <div className="relative flex items-start justify-between gap-3 w-full">
      <p className="leading-6 text-white text-lg">{title}</p>
      <ArrowUpRight className="size-5 shrink-0 text-foreground-300" strokeWidth={1.5} />
    </div>
    {description && <p className="relative max-w-[360px] text-foreground-200">{description}</p>}
    {children}
  </Link>
);

const Compliance = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>Ready for Enterprise</h2>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full">
      {/* The breaks are the frame's, and they only apply once a card is actually
          at its 434 design width — below lg the grid is narrower (or single
          column) and the text wraps on its own. */}

      <Card
        title="Open Source"
        description="Apache 2.0 licensed"
        href="https://github.com/lmnr-ai/lmnr?tab=Apache-2.0-1-ov-file#readme"
      />
      <Card
        title="Deploy on AWS or GCP with Helm"
        description={
          <>
            Run Laminar on Kubernetes with the <br className="hidden lg:block" />
            Laminar Helm chart.
          </>
        }
        href="https://laminar.sh/docs/hosting-options#hosting-options"
      />
      <Card
        title="PII redaction at scale"
        description={
          <>
            Laminar redacts sensitive information from <br className="hidden lg:block" />
            every span on Laminar&apos;s own infrastructure <br className="hidden lg:block" />
            before storage.
          </>
        }
        href="https://laminar.sh/docs/platform/pii-redaction"
      />
      <Card title="HIPAA & SOC 2 Type II Compliant" href="https://compliance.laminar.sh/">
        {/* 84px badges 16px apart, sitting 24px under the title — the frame puts
            a little more air here than the text cards' gap. The pt is 14, not
            12, because it sits ON TOP of the card's own 10px gap. */}
        <div className="relative flex items-center gap-4 pt-3.5">
          <Image src="/assets/landing/hipaa.svg" alt="HIPAA compliant" width={84} height={84} className="size-[84px]" />
          <Image
            src="/assets/landing/soc2.svg"
            alt="SOC 2 Type II compliant"
            width={84}
            height={84}
            className="size-[84px]"
          />
        </div>
      </Card>
    </div>
  </section>
);

export default Compliance;
