import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import { type ReactNode } from "react";

import { LANDING_COLUMN_MAX_W } from "@/components/landing/layout";
import { type BlogMetadata } from "@/lib/blog/types";
import { cn } from "@/lib/utils";

import BlogMeta from "../blog-meta";

interface Props {
  data: BlogMetadata;
  backHref: string;
  backLabel: string;
  children: ReactNode;
}

const BackLink = ({ backHref, backLabel }: { backHref: string; backLabel: string }) => (
  <Link
    href={backHref}
    className="text-sm text-secondary-foreground hover:text-primary flex items-center gap-0.5 w-fit"
  >
    <ChevronLeft size={16} />
    {backLabel}
  </Link>
);

// Single landing-aligned 880px column. Back link + meta + article all share
// the same axis as the rest of the marketing pages.
export default function PostLayout({ data, backHref, backLabel, children }: Props) {
  return (
    <div className="mt-8 md:mt-14 lg:mt-20 flex justify-center w-full px-4 pb-16">
      <div className={cn("flex flex-col gap-4 w-full", LANDING_COLUMN_MAX_W)}>
        <BackLink backHref={backHref} backLabel={backLabel} />
        <BlogMeta data={data} className="mt-4" />
        <article className="flex flex-col z-30 w-full mt-4 sm:mt-8 pt-4 text-base">{children}</article>
      </div>
    </div>
  );
}
