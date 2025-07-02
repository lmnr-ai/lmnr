import { zodResolver } from "@hookform/resolvers/zod";
import { Check, Loader2 } from "lucide-react";
import React, { useCallback, useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import useSWR, { useSWRConfig } from "swr";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  options?: { value: number; label: string }[];
}

const evaluationScoreSchema = z.object({
  // validate input
  score: z.union([z.string(), z.number()]).refine(
    (val) => {
      if (typeof val === "string") {
        const num = parseFloat(val);
        return !isNaN(num) && val.trim() !== "";
      }
      return !isNaN(val);
    },
    {
      message: "Score is required and must be a valid number",
    }
  ),
});

type EvaluationScoreForm = z.infer<typeof evaluationScoreSchema>;

const HumanEvaluationScore = ({
  options,
  evaluationId,
  name,
  spanId,
  projectId,
  resultId,
}: HumanEvaluationScoreProps) => {
  const { toast } = useToast();
  const hasOptions = options && options.length > 0;

  const { data, mutate, isLoading, isValidating } = useSWR<EvaluationScore>(
    `/api/projects/${projectId}/evaluation-scores/${resultId}?name=${name}`,
    swrFetcher,
    {
      revalidateOnMount: true,
    }
  );

  const { mutate: mutateGlobal } = useSWRConfig();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EvaluationScoreForm>({
    resolver: zodResolver(evaluationScoreSchema),
    defaultValues: {
      score: undefined,
    },
  });

  useEffect(() => {
    if (data && data.score !== null) {
      reset({
        score: hasOptions ? data.score.toString() : data.score,
      });
    }
  }, [data, data?.score, hasOptions, reset]);

  const onSubmit = useCallback(
    async (formData: EvaluationScoreForm) => {
      const scoreValue = typeof formData.score === "string" ? parseFloat(formData.score) : formData.score;

      if (isNaN(scoreValue)) return;

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

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData?.error || "Request failed. Please try again.");
        }

        if (!spanResponse.ok) {
          const errorData = await response.json();
          throw new Error(errorData?.error || "Request failed. Please try again.");
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
              typeof keyString === "string" &&
              keyString.includes(`api/projects/${projectId}/evaluations/${evaluationId}`)
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
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "Failed to save evaluation score",
          variant: "destructive",
        });
      }
    },
    [projectId, resultId, data?.name, spanId, mutate, mutateGlobal, toast, evaluationId]
  );

  if (isLoading || !data) {
    return (
      <div className="border rounded-lg p-4 space-y-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="border rounded-lg p-4 space-y-4">
      {hasOptions ? (
        <div className="space-y-2">
          <Label className="text-sm font-medium">Score Options</Label>
          <Controller
            name="score"
            control={control}
            render={({ field: { value, onChange } }) => (
              <RadioGroup value={value?.toString() || ""} onValueChange={onChange} disabled={isValidating}>
                {options.map((option) => (
                  <div key={`${option.label}-${option.value}`} className="flex items-center space-x-2">
                    <RadioGroupItem
                      indicatorClassName="fill-pink-400/80 text-pink-400/80 h-2.5 w-2.5"
                      className="border-pink-400/80 fill-pink-400/80"
                      value={String(option.value)}
                    />
                    <Label title={String(option.value)}>{option.label}</Label>
                  </div>
                ))}
              </RadioGroup>
            )}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <Label htmlFor="score" className="text-sm font-medium">
            Score
          </Label>
          <Controller
            name="score"
            control={control}
            render={({ field: { value, onChange, onBlur } }) => (
              <Input
                disabled={isValidating}
                id="score"
                type="number"
                placeholder="Enter numeric score"
                className="w-full hide-arrow"
                value={value?.toString() || ""}
                onChange={(e) => onChange(e.target.value)}
                onBlur={onBlur}
              />
            )}
          />
        </div>
      )}
      {errors.score && <p className="text-sm text-red-500">{errors.score.message}</p>}

      <Button
        type="submit"
        disabled={isSubmitting}
        variant="outline"
        className="text-pink-400/80 border-pink-400/80"
        handleEnter
      >
        {isSubmitting ? <Loader2 className="animate-spin h-4 w-4 mr-2" /> : <Check className="w-4 h-4 mr-2" />}
        <span>Save Score</span>
      </Button>
    </form>
  );
};

export default HumanEvaluationScore;
