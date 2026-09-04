"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { cn } from "@/lib/utils";

import { CHIP, CHIP_ARROW } from "./constants";

/** The way out of the trace when the event has no cluster to carry one. Opens
 *  with text rather than an icon, so it takes 2px more inset on the left. */
export default function OpenInSignalsButton({ href }: { href: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      className={cn(
        CHIP,
        "min-w-0 shrink-0 overflow-hidden pr-1.5 pl-2 transition-colors bg-signal/14 hover:bg-signal/24"
      )}
    >
      <span className="min-w-0 truncate">Open in Signals</span>
      <ArrowUpRight className={CHIP_ARROW} />
    </Link>
  );
}
