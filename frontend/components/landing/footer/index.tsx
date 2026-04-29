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

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const ELSEWHERE_LINKS: FooterLink[] = [
  { label: "Contact", href: "mailto:founders@lmnr.ai?subject=Enterprise%20Inquiry" },
  { label: "Github", href: "https://github.com/lmnr-ai/lmnr", external: true },
  { label: "Join Discord", href: "https://discord.gg/nNFUUDAKub", external: true },
  { label: "LinkedIn", href: "https://www.linkedin.com/company/lmnr-ai", external: true },
  { label: "X", href: "https://x.com/lmnrai", external: true },
];

const MORE_LINKS: FooterLink[] = [
  { label: "Privacy Policy", href: "/policies/privacy", external: true },
  { label: "Terms of Service", href: "/policies/terms", external: true },
  { label: "Status", href: "https://status.laminar.sh", external: true },
];

const integration = (label: string, slug: string): FooterLink => ({
  label,
  href: `https://laminar.sh/docs/tracing/integrations/${slug}`,
  external: true,
});

const INTEGRATIONS_COL_1: FooterLink[] = [
  integration("Claude Agent SDK", "claude-agent-sdk"),
  integration("OpenAI Agents SDK", "openai-agents-sdk"),
  integration("Mastra", "mastra"),
  integration("Pydantic AI", "pydantic-ai"),
  integration("AI SDK", "vercel-ai-sdk"),
  integration("LangChain", "langchain"),
  integration("OpenHands SDK", "openhands-sdk"),
];

const INTEGRATIONS_COL_2: FooterLink[] = [
  integration("Browser Use", "browser-use"),
  integration("Stagehand", "stagehand"),
  integration("Playwright", "playwright"),
  integration("Anthropic", "anthropic"),
  integration("OpenAI", "openai"),
  integration("LiteLLM", "litellm"),
];

const FooterLinkText = ({ link }: { link: FooterLink }) => (
  <Link
    href={link.href}
    target={link.external ? "_blank" : undefined}
    className="text-sm text-landing-text-300 hover:text-landing-text-100 transition-colors"
  >
    {link.label}
  </Link>
);

const FooterColumn = ({
  header,
  links,
  hideHeader = false,
  className,
}: {
  header: string;
  links: FooterLink[];
  hideHeader?: boolean;
  className?: string;
}) => (
  <div className={cn("flex flex-col gap-3 items-start", className)}>
    <p className={cn("text-sm text-landing-text-500", hideHeader && "opacity-0 pointer-events-none")}>{header}</p>
    {links.map((link) => (
      <FooterLinkText key={`${header}-${link.label}`} link={link} />
    ))}
  </div>
);

const Footer = ({ className }: Props) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end end"] });
  const offset = useTransform(scrollYProgress, [0, 1], [isMobile ? -100 : -200, 0]);
  const opacity = useTransform(scrollYProgress, [0, 1], [0, 1]);

  return (
    <div className={cn("bg-landing-surface-800 flex flex-col items-start w-full", className)}>
      <div
        className={cn(
          "flex flex-col items-end justify-end pt-[120px] w-full md:pb-8 md:px-8 lg:pb-20 lg:px-20",
          "px-5 pb-10"
        )}
      >
        {/* Desktop: heading + buttons (left) | 4 columns (right) */}
        <div className="hidden md:flex items-start w-full md:gap-[60px] lg:gap-[100px]">
          <div className="flex flex-col gap-8 items-start shrink-0">
            <div className={cn("text-left leading-normal", subsectionTitle)}>
              Understand why your agent failed.
              <br />
              Iterate fast to fix it.
            </div>
            <div className="flex gap-5 items-center w-[316px]">
              <Link href="https://laminar.sh/docs" target="_blank" className="flex-1 basis-0">
                <LandingButton variant="outline" className="w-full">
                  Read the Docs
                </LandingButton>
              </Link>
              <Link href="/sign-up" className="flex-1 basis-0">
                <LandingButton variant="primary" className="w-full">
                  Get Started
                </LandingButton>
              </Link>
            </div>
          </div>
          <div className="flex flex-1 min-w-0 justify-between items-start">
            <FooterColumn header="Connect" links={ELSEWHERE_LINKS} className="w-[140px]" />
            <FooterColumn header="More" links={MORE_LINKS} className="w-[140px]" />
            <FooterColumn header="Integrations" links={INTEGRATIONS_COL_1} className="w-[140px]" />
            <FooterColumn header="Integrations" links={INTEGRATIONS_COL_2} hideHeader className="w-[140px]" />
          </div>
        </div>

        {/* Mobile: heading + buttons (centered), then 2-col Elsewhere/More, then full-width Integrations */}
        <div className="md:hidden flex flex-col gap-24 items-center w-full">
          <div className="flex flex-col gap-8 items-center w-full">
            <div className={cn("text-center leading-12", subsectionTitle)}>
              Understand
              <br />
              why your agent failed.
              <br />
              Iterate fast to fix it.
            </div>
            <div className="flex gap-2 items-center w-full max-w-[360px]">
              <Link href="https://laminar.sh/docs" target="_blank" className="flex-1 basis-0">
                <LandingButton variant="outline" className="w-full">
                  Read the Docs
                </LandingButton>
              </Link>
              <Link href="/sign-up" className="flex-1 basis-0">
                <LandingButton variant="primary" className="w-full">
                  Get Started
                </LandingButton>
              </Link>
            </div>
          </div>
          <div className="flex flex-col gap-10 items-start w-full px-2">
            <div className="flex w-full gap-4">
              <FooterColumn header="Connect" links={ELSEWHERE_LINKS} className="flex-1" />
              <FooterColumn header="More" links={MORE_LINKS} className="flex-1" />
            </div>
            <div className="flex flex-col gap-3 items-start w-full">
              <p className="text-sm text-landing-text-500">Integrations</p>
              <div className="flex w-full gap-4">
                <div className="flex-1 flex flex-col gap-3 items-start">
                  {INTEGRATIONS_COL_1.map((link) => (
                    <FooterLinkText key={`int1-${link.label}`} link={link} />
                  ))}
                </div>
                <div className="flex-1 flex flex-col gap-3 items-start">
                  {INTEGRATIONS_COL_2.map((link) => (
                    <FooterLinkText key={`int2-${link.label}`} link={link} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div
        className={cn("bg-landing-surface-900 flex flex-col items-start justify-end overflow-hidden w-full")}
        ref={ref}
      >
        <motion.div
          className={cn("relative w-full overflow-hidden md:p-8 lg:p-20", "p-6")}
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
