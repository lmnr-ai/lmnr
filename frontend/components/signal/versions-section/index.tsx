"use client";

import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useMemo } from "react";
import useSWR from "swr";

import { signalVersionsKey } from "@/components/signal/hooks/use-signal-version-markers";
import { useSignalStoreContext } from "@/components/signal/store";
import { Accordion } from "@/components/ui/accordion";
import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/utils";

import { buildChangelog, type SignalVersionItem } from "./changelog";
import VersionRow from "./version-row";

export default function VersionsSection() {
  const { projectId } = useParams();
  const searchParams = useSearchParams();
  const signalId = useSignalStoreContext((state) => state.signal.id);

  const { data, isLoading, error } = useSWR<{ items: SignalVersionItem[] }>(
    projectId && signalId ? signalVersionsKey(String(projectId), signalId) : null,
    swrFetcher
  );

  const entries = useMemo(() => buildChangelog(data?.items ?? []), [data?.items]);
  const versionParam = searchParams.get("version");

  useEffect(() => {
    if (!versionParam || !data) return;
    requestAnimationFrame(() => {
      document.getElementById(`signal-version-${versionParam}`)?.scrollIntoView({ block: "nearest" });
    });
  }, [versionParam, data]);

  if (error) {
    return <p className="text-sm text-destructive">Couldn&apos;t load versions.</p>;
  }

  if (isLoading || !data) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No versions yet.</p>;
  }

  return (
    <Accordion
      key={versionParam ?? "none"}
      type="single"
      collapsible
      defaultValue={versionParam ?? undefined}
      className="w-full"
    >
      {entries.map((entry) => (
        <VersionRow key={entry.version} entry={entry} />
      ))}
    </Accordion>
  );
}
