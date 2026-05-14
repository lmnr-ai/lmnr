import Image from "next/image";

import { cn } from "@/lib/utils";

import { bodyMedium, subSection } from "../class-names";
import LearnMoreLink from "./learn-more-link";

const BuiltForProduction = () => (
  <section className={cn("flex flex-col items-center w-full px-6 gap-[52px]")}>
    <h2 className={subSection}>Built for production</h2>
    <p className={bodyMedium}>
      {"Blazing fast data ingestion, written in Rust,\nterabytes of production data with ease"}
    </p>

    <div className="flex flex-col items-center gap-8">
      <p className={bodyMedium}>HIPAA, SOC 2 Type 2 compliant</p>
      <div className="flex items-center gap-6">
        <Image src="/assets/landing/hipaa.svg" alt="HIPAA compliant" width={90} height={90} className="size-[90px]" />
        <Image
          src="/assets/landing/soc2.svg"
          alt="SOC 2 Type 2 compliant"
          width={90}
          height={90}
          className="size-[90px]"
        />
      </div>
      <LearnMoreLink label="Learn more about compliance" href="https://laminar.sh/docs/compliance" />
    </div>
  </section>
);

export default BuiltForProduction;
