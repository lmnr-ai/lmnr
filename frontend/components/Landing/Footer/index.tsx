"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

import laminarTextLogo from "@/assets/landing/laminar-text.svg";
import LandingButton from "../LandingButton";
import { sectionHeaderMedium } from "../classNames";
import { motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";

interface Props {
  className?: string;
}

const Footer = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const offset = useTransform(scrollYProgress, [0, 1], [-200, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div className={cn("bg-landing-surface-800 flex flex-col items-start w-full", className)}>
      <div className="flex flex-col items-end justify-end pb-20 pt-[120px] px-20 w-full">
        <div className="flex items-end justify-between w-full">
          <div className="flex flex-col gap-8 items-start">
            <div className={sectionHeaderMedium}>
              <p className="mb-0">Build reliable </p>
              <p>AI agents today</p>
            </div>
            <div className="flex gap-5 items-center">
              <Link href="https://docs.laminar.sh" target="_blank">
                <LandingButton
                  variant="outline"
                  className="border-[#555] border-[0.5px] text-base tracking-[1.28px] font-light"
                >
                  READ THE DOCS
                </LandingButton>
              </Link>
              <Link href="/sign-up">
                <LandingButton variant="primary" className="text-base tracking-[1.28px] font-light">
                  GET STARTED FREE
                </LandingButton>
              </Link>
            </div>
          </div>
          <div className="flex gap-[120px] items-start">
            <div className="flex flex-col gap-[20px] items-start">
              <Link href="/contact">
                <LandingButton
                  variant="minimal"
                  className="text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  CONTACT US
                </LandingButton>
              </Link>
              <Link href="https://github.com/lmnr-ai/lmnr" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  GITHUB
                </LandingButton>
              </Link>
              <Link target="_blank" href="https://discord.gg/nNFUUDAKub">
                <LandingButton
                  variant="minimal"
                  className="text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  JOIN DISCORD
                </LandingButton>
              </Link>
            </div>
            <div className="flex flex-col gap-[20px] items-start">
              <Link href="/policies/privacy" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  PRIVACY POLICY
                </LandingButton>
              </Link>
              <Link href="/policies/terms" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  TERMS OF SERVICE
                </LandingButton>
              </Link>
              <Link href="https://status.laminar.sh" target="_blank">
                <LandingButton
                  variant="minimal"
                  className="text-sm tracking-[1.12px] font-light text-landing-text-100 hover:text-landing-text-200"
                >
                  STATUS
                </LandingButton>
              </Link>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-landing-surface-900 flex flex-col items-start justify-end overflow-clip p-20 w-full" ref={ref}>
        <motion.div
          className="aspect-[1352/291] relative w-full"
          style={{
            y: offset,
            opacity,
          }}
        >
          <Image alt="Laminar logo" src={laminarTextLogo} fill className="object-contain" />
        </motion.div>
      </div>
    </div>
  );
};

export default Footer;
