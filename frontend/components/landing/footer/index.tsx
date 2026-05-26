"use client";

import Image from "next/image";
import Link from "next/link";

import laminarLogo from "@/assets/logo/laminar-wordmark.svg";
import { cn } from "@/lib/utils";

import { LANDING_COLUMN_MAX_W } from "../class-names";

interface Props {
  className?: string;
}

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

const ELSEWHERE_LINKS: FooterLink[] = [
  { label: "Contact", href: "mailto:founders@lmnr.ai", external: true },
  { label: "Book demo", href: "https://cal.com/robert-lmnr/30min", external: true },
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
    className="text-sm text-landing-text-300 hover:text-landing-text-100 transition-colors whitespace-nowrap"
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
    <p
      className={cn(
        "text-sm text-primary-foreground whitespace-nowrap",
        hideHeader && "opacity-0 pointer-events-none select-none"
      )}
    >
      {header}
    </p>
    {links.map((link) => (
      <FooterLinkText key={`${header}-${link.label}`} link={link} />
    ))}
  </div>
);

const Footer = ({ className }: Props) => (
  <div className={cn("flex flex-col items-center w-full", className)}>
    <div
      className={cn(
        "w-full border-t border-landing-surface-500",
        LANDING_COLUMN_MAX_W,
        "md:pt-20 md:pb-[120px]",
        "pt-16 pb-20",
        "px-6 lg:px-0"
      )}
    >
      {/* Desktop */}
      <div className="hidden xl:flex gap-[80px] items-start w-full">
        <Image
          src={laminarLogo}
          alt="Laminar"
          width={100}
          height={18}
          className="shrink-0 object-contain h-[18px] w-auto"
        />
        <div className="flex flex-1 min-w-0 justify-between items-start">
          <FooterColumn header="Integrations" links={INTEGRATIONS_COL_1} className="w-[140px]" />
          <FooterColumn header="Integrations" links={INTEGRATIONS_COL_2} hideHeader className="w-[140px]" />
          <FooterColumn header="Connect" links={ELSEWHERE_LINKS} className="w-[140px]" />
          <FooterColumn header="More" links={MORE_LINKS} className="w-[140px]" />
        </div>
      </div>

      {/* Mobile / tablet */}
      <div className="xl:hidden flex flex-col items-start gap-12 w-full">
        <Image
          src={laminarLogo}
          alt="Laminar"
          width={100}
          height={18}
          className="shrink-0 object-contain h-[18px] w-auto"
        />
        <div className="flex flex-col gap-10 items-start w-full">
          <div className="flex w-full gap-4">
            <FooterColumn header="Connect" links={ELSEWHERE_LINKS} className="flex-1" />
            <FooterColumn header="More" links={MORE_LINKS} className="flex-1" />
          </div>
          <div className="flex flex-col gap-3 items-start w-full">
            <p className="text-sm text-primary-foreground whitespace-nowrap">Integrations</p>
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
  </div>
);

export default Footer;
