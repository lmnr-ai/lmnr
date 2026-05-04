"use client";

import { motion, type MotionValue, useScroll, useTransform } from "framer-motion";
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
      "bg-landing-surface-700 overflow-hidden relative rounded-lg w-full min-w-0",
      "md:flex md:flex-col md:items-start md:gap-6 md:px-6 md:py-6",
      "flex flex-col gap-6 p-5",
      className
    )}
  >
    <div className={cn("shrink-0 z-10 flex items-start", "md:gap-5 md:w-full", "w-full gap-3")}>
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
        <p className={cn("font-sans text-landing-text-300", "md:text-base md:leading-5", "text-sm leading-5")}>
          {subtitle}
        </p>
      </div>
    </div>

    <div className={cn("flex items-start min-w-0 self-stretch", "md:flex-1", "w-full justify-start")}>
      <div className="md:w-[540px] w-[400px] h-full shrink-0">{children}</div>
    </div>

    <div className="absolute right-0 top-0 bottom-0 md:w-[73px] w-[60px] bg-gradient-to-l from-landing-surface-700 to-transparent pointer-events-none" />

    <div className="absolute bottom-0 left-0 right-0 md:h-[73px] h-[60px] bg-gradient-to-t from-landing-surface-700 to-transparent pointer-events-none" />
  </div>
);

const MockEntrance = ({ progress, children }: { progress: MotionValue<number>; children: ReactNode }) => {
  const opacity = useTransform(progress, [0, 0.4], [0.6, 1], { clamp: true });
  const x = useTransform(progress, [0, 0.4], [80, 0], { clamp: true });
  return (
    <motion.div style={{ opacity, x }} className="size-full">
      {children}
    </motion.div>
  );
};

const SlackNotifications = ({ className }: Props) => {
  const slackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: slackProgress } = useScroll({
    target: slackRef,
    offset: ["start end", "end start"],
  });

  const getContextRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: getContextProgress } = useScroll({
    target: getContextRef,
    offset: ["start end", "end start"],
  });

  const fixRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress: fixProgress } = useScroll({
    target: fixRef,
    offset: ["start end", "end start"],
  });

  return (
    <div className={cn("flex w-full", "md:flex-row md:gap-2", "flex-col gap-5", className)}>
      <StepCard
        number={1}
        label="Receive alerts"
        subtitle="Slack and email alerts about critical issues and weekly summaries of your Signal events."
        className="md:h-[540px]"
        ref={slackRef}
      >
        <MockEntrance progress={slackProgress}>
          <SlackAlertMock />
        </MockEntrance>
      </StepCard>
      <StepCard
        number={2}
        label="Get context"
        subtitle="See when, why, and how things went wrong. Quickly dive into related traces."
        className="md:h-[540px]"
        ref={getContextRef}
      >
        <GetContextMock progress={getContextProgress} />
      </StepCard>
      <StepCard
        number={3}
        label="Fix with confidence"
        subtitle="Ship a fix based on the full picture, not a guess."
        className="md:h-[540px]"
        ref={fixRef}
      >
        <MockEntrance progress={fixProgress}>
          <FixMock />
        </MockEntrance>
      </StepCard>
    </div>
  );
};

export default SlackNotifications;
