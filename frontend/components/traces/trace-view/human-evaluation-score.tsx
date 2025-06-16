import { Check, Loader2 } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EvaluationResultsInfo } from "@/lib/evaluation/types";
import { useToast } from "@/lib/hooks/use-toast";
import { swrFetcher } from "@/lib/utils";

interface EvaluationScore {
  id: string;
  resultId: string;
  labelId: string | null;
  score: number | null;
  createdAt: string;
  name: string;
}

interface HumanEvaluationScoreProps {
  evaluationId: string;
  name: string;
  spanId: string;
  resultId: string;
  projectId: string;
}

const HumanEvaluationScore = ({ evaluationId, name, spanId, projectId, resultId }: HumanEvaluationScoreProps) => {
  const scoreInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

  const { data, mutate, isLoading } = useSWR<EvaluationScore>(
    `/api/projects/${projectId}/evaluation-scores/${resultId}?name=${name}`,
    swrFetcher
  );

  const { mutate: mutateGlobal } = useSWRConfig();

  useEffect(() => {
    if (data && scoreInputRef.current) {
      scoreInputRef.current.value = data.score?.toString() || "";
    }
  }, [data, data?.score]);

  const handleSubmit = useCallback(async () => {
    if (!scoreInputRef.current) return;

    const scoreValue = parseFloat(scoreInputRef.current.value);
    if (isNaN(scoreValue) || scoreInputRef.current.value === "") return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/evaluation-scores/${resultId}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: data?.name,
          score: scoreValue,
        }),
      });

      const spanResponse = await fetch(`/api/projects/${projectId}/spans/${spanId}`, {
        method: "PATCH",
        body: JSON.stringify({
          output: scoreValue,
        }),
      });

      if (!response.ok || !spanResponse.ok) {
        throw new Error("Failed to save score");
      }

      await mutate(
        (currentData) => {
          if (currentData) {
            return { ...currentData, score: scoreValue };
          }
        },
        { revalidate: false, populateCache: true, rollbackOnError: true }
      );

      await mutateGlobal(
        (key) => {
          const keyString = Array.isArray(key) ? key[0] : key;
          return (
            typeof keyString === "string" && keyString.includes(`api/projects/${projectId}/evaluations/${evaluationId}`)
          );
        },
        (currentData: EvaluationResultsInfo | undefined) => {
          if (!currentData || !data?.name) return currentData;

          return {
            ...currentData,
            results: currentData.results.map((result) => ({
              ...result,
              scores: {
                ...result.scores,
                [data?.name]: scoreValue,
              },
            })),
          };
        },
        { revalidate: true }
      );
      toast({
        description: "Score saved successfully",
      });
    } catch (error) {
      console.error("Error saving score:", error);
      toast({
        title: "Error",
        description: "Failed to save evaluation score",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [projectId, resultId, data?.name, spanId, mutate, toast]);

  if (isLoading) {
    return (
      <div className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 space-y-4">
      <div className="space-y-2">
        <Label htmlFor="score" className="text-sm font-medium">
          Score *
        </Label>
        <Input
          ref={scoreInputRef}
          id="score"
          type="number"
          placeholder="Enter score (e.g., 4.5, 0.85, 10)"
          className="w-full hide-arrow"
        />
      </div>

      <Button
        handleEnter
        onClick={handleSubmit}
        disabled={isSubmitting}
        variant="outline"
        className="text-pink-400/80 border-pink-400/80"
      >
        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Check className="w-4 h-4 mr-2" />}
        <span>Save Score</span>
      </Button>
    </div>
  );
};
export default HumanEvaluationScore;
