import { cn } from "@/lib/utils";
import { sectionHeaderLarge, bodyLarge } from "../classNames";
import DocsButton from "../DocsButton";
import SystemDiagram from "./SystemDiagram";

interface Props {
  className?: string;
}

const SecondHalf = ({ className }: Props) => {
  return (
    <div
      className={cn(
        "bg-landing-surface-800 flex flex-col gap-[240px] items-center justify-center py-[280px] px-0 w-full",
        className
      )}
    >
      {/* Try it local, free section */}
      <div className="flex items-center relative shrink-0 w-[1164px]">
        <div className="basis-0 flex flex-col gap-6 grow items-start min-h-px min-w-px relative shrink-0">
          <p className={cn(sectionHeaderLarge, "text-justify whitespace-nowrap")}>Try it local, free</p>
          <div className="flex flex-col items-start relative shrink-0 w-[380px]">
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] relative shrink-0 w-full">
              <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>
                Set up with Docker in three lines
              </p>
            </div>
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] relative shrink-0 w-full">
              <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Open source</p>
            </div>
            <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] relative shrink-0 w-full">
              <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Self-host anywhere</p>
            </div>
          </div>
          <DocsButton />
        </div>
        {/* Placeholder div for git clone and trace viewer */}
        <div className="bg-landing-surface-700 w-[500px] h-[400px]" />
      </div>

      {/* Ready to scale section */}
      <div className="flex items-center relative shrink-0 w-[1164px]">
        <div className="basis-0 flex flex-col grow items-start min-h-px min-w-px relative shrink-0">
          <div className="flex flex-col gap-6 items-start relative shrink-0 w-[437px]">
            <div className={cn(sectionHeaderLarge, "text-justify whitespace-nowrap")}>
              <p className="mb-0">Ready to scale?</p>
              <p>We got you.</p>
            </div>
            <div className="flex flex-col items-start relative shrink-0 w-full">
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] relative shrink-0 w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Affordable hosted solution</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] relative shrink-0 w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Workspace members and roles</p>
              </div>
              <div className="border-t border-landing-surface-400 flex items-center justify-center px-0 py-[18px] relative shrink-0 w-full">
                <p className={cn(bodyLarge, "basis-0 grow min-h-px min-w-px shrink-0")}>Terabytes of data with ease</p>
              </div>
            </div>
            <DocsButton />
          </div>
        </div>
      </div>

      {/* Production-grade section */}
      <div className="flex gap-10 items-center relative shrink-0 w-full pl-[calc((100%-1142px)/2)] ">
        <div className="basis-0 flex flex-col gap-[37px] grow items-start min-h-px min-w-px relative shrink-0">
          <div className="flex flex-col items-start relative shrink-0">
            <div className={cn(sectionHeaderLarge, "leading-[54px] whitespace-nowrap")}>
              <p className="mb-0">Production-grade</p>
              <p>to the core</p>
            </div>
          </div>
          <p className="font-sans font-normal leading-6 text-base text-landing-text-200 w-[394px]">
            Built in Rust and mega-optimized for performance. Terabytes of trace data in production without slowing
            down.
            <br />
            <br />
            SOC2 and HIPAA compliant.
          </p>
          <div className="flex gap-5 items-start relative shrink-0">
            <div className="bg-landing-surface-600 size-[90px]" />
            <div className="bg-landing-surface-600 size-[90px]" />
          </div>
        </div>
        {/* Architecture diagram placeholder */}
        <SystemDiagram className="flex-1" />
      </div>
    </div>
  );
};

export default SecondHalf;
