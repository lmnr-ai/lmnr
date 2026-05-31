"use client";

import { ArrowRight } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { type Evaluation as EvaluationType } from "@/lib/evaluation/types";
import { formatTimestamp } from "@/lib/utils";

interface EvalSelectorPairProps {
  evaluations: EvaluationType[];
}

// Breadcrumb-styled trigger: no border / background, inherits font, default caret.
const TRIGGER_CLASS = "h-auto w-auto border-none bg-transparent px-2 py-0 text-sm gap-1";

export default function EvalSelectorPair({ evaluations }: EvalSelectorPairProps) {
  const searchParams = useSearchParams();
  const pathName = usePathname();
  const { projectId, evaluationId } = useParams();
  const router = useRouter();
  const targetId = searchParams.get("targetId");

  const handleChange = (value?: string) => {
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
      <Select key={targetId} value={targetId ?? undefined} onValueChange={handleChange}>
        <SelectTrigger
          disabled={evaluations.length <= 1}
          className={`${TRIGGER_CLASS} text-muted-foreground data-[placeholder]:text-muted-foreground`}
        >
          <SelectValue placeholder="Compare" />
        </SelectTrigger>
        <SelectContent>
          {evaluations
            .filter((item) => item.id !== evaluationId)
            .map((item) => (
              <SelectItem key={item.id} value={item.id} textValue={item.name}>
                <span>
                  {item.name}
                  <span className="text-secondary-foreground text-xs ml-2">{formatTimestamp(item.createdAt)}</span>
                </span>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      <ArrowRight size={14} className="flex-none text-secondary-foreground" />
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
              <SelectItem key={item.id} value={item.id} textValue={item.name}>
                <span>
                  {item.name}
                  <span className="text-secondary-foreground text-xs ml-2">{formatTimestamp(item.createdAt)}</span>
                </span>
              </SelectItem>
            ))}
        </SelectContent>
      </Select>
      {targetId && (
        <Button variant="outline" size="sm" onClick={() => handleChange(undefined)}>
          Reset
        </Button>
      )}
    </div>
  );
}
