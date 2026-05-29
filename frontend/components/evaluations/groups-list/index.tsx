"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { useCallback, useEffect } from "react";
import useSWR from "swr";

import { Skeleton } from "@/components/ui/skeleton";
import { swrFetcher } from "@/lib/utils";

import type { EvaluationGroup, GroupVariant } from "./types";
import VariantToggle from "./variant-toggle";
import HoverDenseVariant from "./variants/hover-dense-variant";
import InlineVariant from "./variants/inline-variant";
import LeadingCountVariant from "./variants/leading-count-variant";
import ListVariant from "./variants/list-variant";
import StackedVariant from "./variants/stacked-variant";

const VARIANT_VALUES = ["list", "stacked", "inline", "leading-count", "hover-dense"] as const;
const variantParser = parseAsStringLiteral(VARIANT_VALUES).withDefault("list").withOptions({ history: "replace" });

export default function GroupsList() {
  const { projectId } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [variant, setVariant] = useQueryState("gv", variantParser);

  const { data: groups, isLoading } = useSWR<EvaluationGroup[]>(
    `/api/projects/${projectId}/evaluation-groups`,
    swrFetcher
  );

  const groupId = searchParams.get("groupId");

  useEffect(() => {
    if (groups && groups.length > 0 && !groupId) {
      router.replace(`/project/${projectId}/evaluations?groupId=${groups[0].groupId}`);
    }
  }, [groups, groupId, router, projectId]);

  const onSelect = useCallback(
    (selectedGroupId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set("groupId", selectedGroupId);
      router.push(`/project/${projectId}/evaluations?${params.toString()}`);
    },
    [projectId, router, searchParams]
  );

  const renderVariant = () => {
    if (!groups) return null;
    const props = { groups, selectedGroupId: groupId, onSelect };
    switch (variant as GroupVariant) {
      case "stacked":
        return <StackedVariant {...props} />;
      case "inline":
        return <InlineVariant {...props} />;
      case "leading-count":
        return <LeadingCountVariant {...props} />;
      case "hover-dense":
        return <HoverDenseVariant {...props} />;
      case "list":
      default:
        return <ListVariant {...props} />;
    }
  };

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-baseline gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Groups</span>
          {groups && <span className="text-[10px] tabular-nums text-muted-foreground/70">{groups.length}</span>}
        </div>
        <VariantToggle value={variant as GroupVariant} onChange={(v) => setVariant(v)} />
      </div>
      <div className="flex-1 overflow-y-auto pr-1">
        {isLoading ? (
          <div className="flex flex-col gap-1.5 py-1">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !groups || groups.length === 0 ? (
          <div className="px-2 py-4 text-xs text-muted-foreground">No evaluation groups yet.</div>
        ) : (
          renderVariant()
        )}
      </div>
    </div>
  );
}
