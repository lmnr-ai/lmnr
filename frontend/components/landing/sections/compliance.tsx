import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { subSection } from "../class-names";
import LearnMoreLink from "./two-lines-to-integrate/learn-more-link";

const ENTERPRISE_ROWS = [
  {
    label: "HIPAA compliant",
    href: "https://compliance.laminar.sh/?tab=securityControls&frameworks=hipaa_business_associate_v1",
  },
  {
    label: "SOC 2 Type II compliant",
    href: "https://compliance.laminar.sh/?tab=securityControls&frameworks=soc2_v1",
  },
  { label: "Automatic PII Redaction", href: "https://laminar.sh/docs/platform/pii-redaction" },
  { label: "Deploy anywhere", href: "https://laminar.sh/docs/hosting-options#hosting-options" },
];

const Compliance = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>Enterprise-ready</h2>

    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-10 w-full">
      <div className="flex flex-col gap-10 items-start w-full max-w-[500px]">
        <div className="flex flex-col w-full">
          {ENTERPRISE_ROWS.map(({ label, href }) => (
            <Link
              key={label}
              href={href}
              target="_blank"
              className={cn(
                "flex items-center gap-3 h-14 w-full border-t border-landing-text-600",
                "text-lg text-landing-text-300 no-underline"
              )}
            >
              {label}
              <ArrowUpRight className="size-4" strokeWidth={2} />
            </Link>
          ))}
        </div>
        <LearnMoreLink href="https://compliance.laminar.sh/" label="Compliance portal" />
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <Image src="/assets/landing/hipaa.svg" alt="HIPAA compliant" width={84} height={84} className="size-[84px]" />
        <Image
          src="/assets/landing/soc2.svg"
          alt="SOC 2 Type 2 compliant"
          width={84}
          height={84}
          className="size-[84px]"
        />
      </div>
    </div>
  </section>
);

export default Compliance;
