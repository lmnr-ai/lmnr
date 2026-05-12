"use client";

import { useScroll, useTransform } from "framer-motion";
import { Mail } from "lucide-react";
import Image from "next/image";
import { useRef } from "react";

import slackLogo from "@/assets/landing/logos/slack.svg";
import { cn } from "@/lib/utils";

import SlackAlertMock from "./slack-alert-mock";

interface Props {
  className?: string;
}

const SlackNotifications = ({ className }: Props) => {
  const sectionRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const mockProgress = useTransform(scrollYProgress, [0.2, 0.6], [0, 1], { clamp: true });

  return (
    <div
      ref={sectionRef}
      className={cn(
        "bg-landing-surface-700 relative overflow-hidden rounded-lg w-full min-w-0",
        "md:flex md:flex-row md:items-stretch md:justify-between",
        "flex flex-col",
        className
      )}
    >
      <div className={cn("flex flex-col items-start shrink-0", "md:w-[472px] md:gap-4 md:p-8", "w-full gap-3 p-5")}>
        <p className={cn("font-space-grotesk text-landing-text-100", "md:text-2xl md:leading-8", "text-xl leading-7")}>
          Know when your agent fails
        </p>
        <p className={cn("font-sans text-landing-text-300", "md:text-base md:leading-5", "text-sm leading-5")}>
          Slack and email alerts notify you of critical issues.
        </p>
        <p className={cn("font-sans text-landing-text-300", "md:text-base md:leading-5", "text-sm leading-5")}>
          Jump straight from an alert into relevant context. See when, why, and how things went wrong.
        </p>

        <div className="flex items-center gap-3 md:mt-0 mt-1">
          <div className="size-14 rounded-lg bg-landing-surface-600 border border-landing-surface-500 flex items-center justify-center shadow-lg">
            <Image src={slackLogo} alt="Slack" width={40} height={40} className="opacity-70" />
          </div>
          <div className="size-14 rounded-lg bg-landing-surface-600 border border-landing-surface-500 flex items-center justify-center shadow-lg">
            <Mail className="size-7 text-landing-text-400" />
          </div>
        </div>
      </div>

      <div className={cn("flex justify-end items-center min-w-0", "md:flex-1 md:p-8", "w-full px-5 pb-5")}>
        <SlackAlertMock progress={mockProgress} />
      </div>
    </div>
  );
};

export default SlackNotifications;
