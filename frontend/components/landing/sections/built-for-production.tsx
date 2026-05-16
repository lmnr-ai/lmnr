import Image from "next/image";

import { subSection } from "../class-names";
import LearnMoreLink from "./learn-more-link";

// Bar comparison: full-width "Laminar" row, 10%-width "Competition" row
// (visualizes the 10x advantage). Bars are bg-landing-text-600 (#434447)
// matching the Figma. Label column is 100px wide, then the bar fills the
// remaining row width.
const ComparisonRow = ({ title }: { title: string }) => (
  <div className="flex flex-col gap-6 w-full pr-[80px]">
    <p className="text-lg leading-6 text-white">{title}</p>
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-end w-full">
        <p className="w-[100px] text-xs text-landing-text-300">Laminar</p>
        <div className="flex-1 h-1.5 bg-landing-text-600" />
      </div>
      <div className="flex items-end w-full">
        <p className="w-[100px] text-xs text-landing-text-300">Competition</p>
        <div className="flex-1">
          <div className="h-1.5 w-[10%] bg-landing-text-600" />
        </div>
      </div>
    </div>
  </div>
);

const BuiltForProduction = () => (
  <section className="flex flex-col items-start gap-[52px] w-full">
    <h2 className={subSection}>Production-grade to the core</h2>
    <div className="flex flex-col gap-[60px] items-start w-full">
      <div className="flex flex-col gap-[52px] items-start w-full">
        <p className="text-lg leading-6 max-w-[440px]">
          <span className="text-white">10x </span>
          <span className="text-landing-text-300">{"ingestion speed and data\ncompression ratio vs competition"}</span>
        </p>
        <div className="flex flex-col gap-[52px] items-start w-full">
          <ComparisonRow title="Ingestion speed" />
          <ComparisonRow title="Compression ratio" />
        </div>
      </div>
      <div className="flex flex-col gap-8 items-start">
        <p className="text-lg leading-6 text-landing-text-300 whitespace-pre-line">
          {"HIPAA, SOC 2 Type 2\ncompliant"}
        </p>
        <div className="flex flex-col gap-6 items-start">
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
    </div>
  </section>
);

export default BuiltForProduction;
