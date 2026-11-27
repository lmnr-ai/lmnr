"use client";

import { ArrowRight, Info } from "lucide-react";
import Link from "next/link";
import useSWR from "swr";

import { swrFetcher } from "@/lib/api/fetch-api";

/** Points projects that still have legacy datasets at them; hidden for projects with none. */
export default function LegacyDatasetsBanner({ projectId }: { projectId: string }) {
  const { data } = useSWR<{ totalCount: number }>(
    `/api/projects/${projectId}/datasets?pageNumber=0&pageSize=1`,
    swrFetcher
  );
  if (!data?.totalCount) return null;

  return (
    <div className="flex w-fit items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
      <Info className="size-3.5 shrink-0" />
      <span>We&apos;re retiring legacy datasets.</span>
      <Link
        href={`/project/${projectId}/datasets`}
        className="flex items-center gap-1 font-medium text-secondary-foreground hover:text-foreground"
      >
        See legacy datasets
        <ArrowRight className="size-3" />
      </Link>
    </div>
  );
}
