import Image from "next/image";

import { bodyMedium, subSection } from "../class-names";
import LearnMoreLink from "./learn-more-link";

const BuiltForProduction = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>Production-grade to the core</h2>
    <div className="flex items-start gap-[60px]">
      <div className="flex flex-col items-start gap-8">
        <p className={bodyMedium}>{"HIPAA, SOC 2 Type 2\ncompliant"}</p>
        <div className="flex flex-col items-start gap-6">
          <div className="flex items-center gap-6">
            <Image
              src="/assets/landing/hipaa.svg"
              alt="HIPAA compliant"
              width={84}
              height={84}
              className="size-[84px]"
            />
            <Image
              src="/assets/landing/soc2.svg"
              alt="SOC 2 Type 2 compliant"
              width={84}
              height={84}
              className="size-[84px]"
            />
          </div>
          <LearnMoreLink label="Learn more about compliance" href="https://compliance.laminar.sh/" />
        </div>
      </div>
      <div className="self-stretch w-px bg-landing-surface-500" />
      <div className="flex flex-col items-start gap-[52px]">
        <p className={bodyMedium}>
          <span className="text-white">50%</span>
          {" trace compression for fast\ningestion and efficient storage"}
        </p>
        <p className={bodyMedium}>
          <span className="text-white">Terabytes</span>
          {" of agent data with\nour Rust ingestion pipeline"}
        </p>
      </div>
    </div>
  </section>
);

export default BuiltForProduction;
