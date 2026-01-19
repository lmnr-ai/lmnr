"use client";

import { motion, useScroll, useTransform } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import { useRef } from "react";

import laminarTextLogo from "@/assets/landing/laminar-text.svg";
import { useIsMobile } from "@/hooks/use-mobile";
import { cn } from "@/lib/utils";

import { subsectionTitle } from "../class-names";
import LandingButton from "../landing-button";

interface Props {
  className?: string;
}

const Footer = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const offset = useTransform(scrollYProgress, [0, 1], [isMobile ? -100 : -200, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div className={cn("bg-landing-surface-800 flex flex-col items-start w-full", className)}>
      <div className={cn("flex flex-col items-end justify-end md:pb-20 pt-[120px] md:px-20 w-full", "px-2 pb-5")}>
        <div className={cn("flex items-end justify-between w-full md:flex-row md:gap-0", "flex-col gap-[60px]")}>
          <div className={cn("flex flex-col gap-8 md:items-start w-full", "items-center")}>
            <div className={cn("md:text-left text-center", subsectionTitle)}>
              Understand
              <br className="md:hidden" /> why your agent failed.
              <br />
              Iterate fast to fix it.
            </div>
            <div className={cn("flex md:gap-5 items-center justify-center", "gap-2 w-[360px]")}>
              <Link href="https://docs.laminar.sh" target="_blank" className={cn("md:w-[206px]", "flex-1 basis-0")}>
                <LandingButton variant="outline" className="w-full">
                  READ THE DOCS
                </LandingButton>
              </Link>
              <Link href="/sign-up" className={cn("md:w-[206px]", "flex-1 basis-0")}>
                <LandingButton variant="primary" className="w-full">
                  GET STARTED FREE
                </LandingButton>
              </Link>
            </div>
          </div>
          <div className={cn("flex md:gap-[120px] items-start md:w-auto", "w-full gap-0")}>
            <div className={cn("flex flex-col md:gap-[20px] items-start", "flex-1 basis-0 gap-3")}>
              <Link href="/contact">
                <LandingButton
                  variant="minimal"
                  className="text-xs md:text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  CONTACT US
                </LandingButton>
              </Link>
              <Link href="https://github.com/lmnr-ai/lmnr" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-xs md:text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  GITHUB
                </LandingButton>
              </Link>
              <Link target="_blank" href="https://discord.gg/nNFUUDAKub">
                <LandingButton
                  variant="minimal"
                  className="text-xs md:text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  JOIN DISCORD
                </LandingButton>
              </Link>
            </div>
            <div className={cn("flex flex-col gap-[20px] items-start", "flex-1 basis-0 gap-3")}>
              <Link href="/policies/privacy" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-xs md:text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  PRIVACY POLICY
                </LandingButton>
              </Link>
              <Link href="/policies/terms" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-xs md:text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  TERMS OF SERVICE
                </LandingButton>
              </Link>
              <Link href="https://status.laminar.sh" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-xs md:text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  STATUS
                </LandingButton>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div
        className={cn("bg-landing-surface-900 flex flex-col items-start justify-end overflow-hidden w-full")}
        ref={ref}
      >
        <motion.div
          className={cn("relative w-full md:p-20 overflow-hidden", "p-6")}
          style={{
            y: offset,
            opacity,
          }}
        >
          <Image
            alt="Laminar logo"
            src={laminarTextLogo}
            width={800}
            height={200}
            className="object-contain w-full h-auto"
          />
        </motion.div>
      </div>
    </div>
  );
};

export default Footer;
