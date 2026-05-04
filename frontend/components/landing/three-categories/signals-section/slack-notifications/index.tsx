"use client";

import { useScroll } from "framer-motion";
import { type ReactNode, type Ref, useRef } from "react";

import { cn } from "@/lib/utils";

import FixMock from "./fix-mock";
import GetContextMock from "./get-context-mock";
import SlackAlertMock from "./slack-alert-mock";

interface Props {
  className?: string;
}

interface StepCardProps {
  number: number;
  label: string;
  subtitle: string;
  className?: string;
  children: ReactNode;
  ref?: Ref<HTMLDivElement>;
}

const StepCard = ({ number, label, subtitle, className, children, ref }: StepCardProps) => (
  <div
    ref={ref}
    className={cn(
      "bg-landing-surface-700 overflow-hidden relative rounded-lg w-full",
      "md:flex md:flex-row md:items-start md:gap-[60px] md:px-8 md:py-8",
      "flex flex-col gap-6 p-5",
      className
    )}
  >
    <div className={cn("shrink-0 z-10 flex items-start", "md:w-[433px] md:gap-5", "w-full gap-3")}>
      <div
        className={cn(
          "flex items-center justify-center rounded border border-landing-surface-400 bg-landing-surface-500 shrink-0",
          "md:size-8 size-7"
        )}
      >
        <span className={cn("font-sans text-landing-text-100", "md:text-base md:leading-5", "text-sm leading-5")}>
          {number}
        </span>
      </div>
      <div className="flex flex-col gap-1 items-start justify-center min-w-0">
        <p
          className={cn(
            "font-space-grotesk text-landing-text-100 whitespace-nowrap",
            "md:text-xl md:leading-8",
            "text-base leading-6"
          )}
        >
          {label}
        </p>
        <p
          className={cn(
            "font-sans text-landing-text-300",
            "md:text-base md:leading-5 md:w-[381px]",
            "text-sm leading-5"
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>

    <div
      className={cn("flex items-center min-w-0", "md:flex-1 md:self-stretch md:justify-center", "w-full justify-start")}
    >
      <div className="md:w-[540px] w-[400px] h-full">{children}</div>
    </div>

    <div className="absolute bottom-0 left-0 right-0 md:h-[73px] h-[60px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
  </div>
);

const SlackNotifications = ({ className }: Props) => {
  const getContextRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: getContextProgress } = useScroll({
    target: getContextRef,
    offset: ["start end", "end start"],
  });

  return (
    <div className={cn("flex flex-col w-full", "md:gap-2 gap-5", className)}>
      <StepCard
        number={1}
        label="Receive alerts"
        subtitle="Slack and email alerts about critical issues and weekly summaries of your Signal events."
        className="md:h-[280px]"
      >
        <SlackAlertMock />
      </StepCard>
      <StepCard
        number={2}
        label="Get context"
        subtitle="See when, why, and how things went wrong. Quickly dive into related traces."
        className="md:h-[280px]"
        ref={getContextRef}
      >
        <GetContextMock progress={getContextProgress} />
      </StepCard>
      <StepCard
        number={3}
        label="Fix with confidence"
        subtitle="Ship a fix based on the full picture, not a guess."
        className="md:h-[280px]"
      >
        <FixMock />
      </StepCard>
    </div>
  );
};

export default SlackNotifications;
