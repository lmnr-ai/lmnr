"use client";

import { ArrowRight } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { formatTimestamp } from "@/lib/utils";

interface EvalSelectorPairProps {
  evaluations: EvaluationType[];
}

// Breadcrumb-styled trigger: no border / background, inherits font, default caret.
const TRIGGER_CLASS = "h-auto w-auto border-none bg-transparent px-2 py-0 text-base gap-1";

export default function EvalSelectorPair({ evaluations }: EvalSelectorPairProps) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId, evaluationId } = useParams();
  const router = useRouter();
  const targetId = searchParams.get("targetId");

  // Compare-mode is purely a function of targetId being set in the URL.
  // Clicking "Compare" picks the first available eval as the default target
  // AND opens the picker so the user can swap to a different one.
  const inCompareMode = !!targetId;
  const firstAvailable = evaluations.find((e) => e.id !== evaluationId);
  const canCompare = !!firstAvailable;
  const [compareOpen, setCompareOpen] = useState(false);

  const setTarget = (value: string | undefined) => {
    const params = new URLSearchParams(searchParams);
    if (value) {
      params.set("targetId", value);
    } else {
      params.delete("targetId");
    }
    router.push(`${pathName}?${params}`);
  };

  return (
    <div className="flex items-center gap-1">
      {inCompareMode && (
        <>
          <Select
            value={targetId ?? undefined}
            open={compareOpen}
            onOpenChange={setCompareOpen}
            onValueChange={(v) => setTarget(v)}
          >
            <SelectTrigger className={`${TRIGGER_CLASS} text-muted-foreground`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {evaluations
                .filter((item) => item.id !== evaluationId)
                .map((item) => (
                  <SelectItem key={item.id} value={item.id} description={formatTimestamp(item.createdAt)}>
                    {item.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <ArrowRight size={14} className="flex-none text-secondary-foreground" />
        </>
      )}
      <Select
        key={String(evaluationId)}
        value={String(evaluationId)}
        onValueChange={(value) => {
          router.push(`/project/${projectId}/evaluations/${value}?${searchParams.toString()}`);
        }}
      >
        <SelectTrigger className={TRIGGER_CLASS}>
          <SelectValue placeholder="Select evaluation" />
        </SelectTrigger>
        <SelectContent>
          {evaluations
            .filter((item) => item.id !== targetId)
            .map((item) => (
              <SelectItem key={item.id} value={item.id} description={formatTimestamp(item.createdAt)}>
                {item.name}
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {inCompareMode ? (
        <Button variant="outline" size="sm" onClick={() => setTarget(undefined)}>
          Reset
        </Button>
      ) : (
        <Button
          variant="outline"
          size="sm"
          disabled={!canCompare}
          onClick={() => {
            setTarget(firstAvailable?.id);
            setCompareOpen(true);
          }}
        >
          Compare
        </Button>
      )}
    </div>
  );
}
