import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../class-names";

const Compliance = () => (
  <section className="flex flex-col items-start gap-10 w-full">
    <div className="flex flex-col items-start">
      <h2 className={cn(subSection, "mb-2")}>Compliance</h2>
      <p className={bodyMedium}>SOC 2 Type II and HIPAA-compliant. </p>
    </div>

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
        Compliance portal
        <ArrowRight className="size-3" strokeWidth={2} />
      </Link>
    </div>
  </section>
);

export default Compliance;
