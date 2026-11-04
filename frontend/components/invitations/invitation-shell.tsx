import Image from "next/image";
import Link from "next/link";
import { type PropsWithChildren, type ReactNode } from "react";

import logo from "@/assets/logo/laminar-wordmark.svg";
import banner from "@/public/welcome-banner-background.png";

interface InvitationShellProps {
  workspaceName: string;
  title: string;
  description: ReactNode;
  email: string;
}

// Web twin of `lib/emails/workspace-invite.tsx`: the same banner + card pair,
// so the page reads as the continuation of the email that linked here.
const InvitationShell = ({
  workspaceName,
  title,
  description,
  email,
  children,
}: PropsWithChildren<InvitationShellProps>) => (
  <div className="flex flex-1 flex-col items-center justify-center bg-surface-150 px-4 py-10">
    <div className="flex w-full max-w-[500px] flex-col gap-2">
      <div className="relative flex min-h-40 flex-col justify-between gap-8 overflow-hidden rounded-lg bg-surface-200 px-5 pt-4 pb-3">
        <Image alt="" src={banner} fill priority sizes="500px" className="object-cover" />
        {/* The wordmark's box runs ascender-top to baseline with no descender room, so
            centring it against text leaves the two baselines ~1px apart. */}
        <div className="relative flex min-w-0 items-baseline gap-2 text-sm text-foreground-200">
          <Link href="/" className="flex shrink-0">
            <Image alt="Laminar" src={logo} className="h-auto w-19" priority />
          </Link>
          <span className="text-foreground-300">/</span>
          <span className="truncate">{workspaceName}</span>
        </div>
        <h1 className="relative line-clamp-2 font-sans-landing text-[28px] leading-[38px] font-medium tracking-[-0.02em] break-words text-white">
          {title}
        </h1>
      </div>

      <div className="flex flex-col gap-6 rounded-lg bg-surface-200 px-5 pt-4 pb-5">
        <p className="font-sans-landing text-sm leading-relaxed text-foreground-200">{description}</p>
        {children}
        <p className="truncate border-t border-surface-300 pt-4 text-xs text-foreground-300">
          Signed in as <span className="text-foreground-200">{email}</span>
        </p>
      </div>

      <p className="px-5 pt-2 text-xs text-foreground-300">
        Questions? Visit our{" "}
        <a
          href="https://docs.lmnr.ai"
          target="_blank"
          rel="noreferrer"
          className="text-foreground-200 underline underline-offset-2 hover:text-white"
        >
          documentation
        </a>{" "}
        or write to{" "}
        <a href="mailto:founders@lmnr.ai" className="text-foreground-200 underline underline-offset-2 hover:text-white">
          founders@lmnr.ai
        </a>
        .
      </p>
    </div>
  </div>
);

export default InvitationShell;
