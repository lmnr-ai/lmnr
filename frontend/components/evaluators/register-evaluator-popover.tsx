import { Gauge, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { ReactNode, useState } from "react";
import useSWR from "swr";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Evaluator } from "@/lib/evaluators/types";
import { useToast } from "@/lib/hooks/use-toast";
import { PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface RegisterEvaluatorPopoverProps {
  spanPath: string[];
  children?: ReactNode;
}

const RegisterEvaluatorPopover = ({ spanPath, children }: RegisterEvaluatorPopoverProps) => {
  const [open, setOpen] = useState(false);
  const [selectedEvaluator, setSelectedEvaluator] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  const { projectId } = useParams();
  const { toast } = useToast();

  const { data: evaluatorsData } = useSWR<PaginatedResponse<Evaluator>>(
    `/api/projects/${projectId}/evaluators?pageSize=100`,
    swrFetcher
  );

  const evaluators = evaluatorsData?.items || [];

  const registerEvaluator = async () => {
    if (!selectedEvaluator) return;

    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/evaluators/${selectedEvaluator}/span-path`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          spanPath,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to register evaluator");
      }

      toast({
        title: "Success",
        description: "Evaluator registered to span path successfully",
      });

      setOpen(false);
      setSelectedEvaluator("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to register evaluator. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Popover
      open={open}
      onOpenChange={(open) => {
        setOpen(open);
        if (!open) {
          setSelectedEvaluator("");
        }
      }}
    >
      <PopoverTrigger asChild>
        {children || (
          <Badge className="cursor-pointer min-w-8" variant="secondary">
            <Gauge className="size-3 min-w-3 mr-2" />
            <span className="text-xs truncate min-w-0 block">Register evaluator</span>
          </Badge>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end" side="bottom">
        <div className="flex flex-col space-y-4">
          <div className="flex flex-col gap-1 ">
            <span className="font-medium">Register evaluator to span path</span>
            <span className="text-sm text-muted-foreground">Path: {spanPath.join(" → ")}</span>
          </div>
          <Select
            disabled={isLoading || evaluators.length === 0}
            value={selectedEvaluator}
            onValueChange={setSelectedEvaluator}
          >
            <SelectTrigger className="font-medium focus:ring-0">
              <SelectValue placeholder={evaluators.length === 0 ? "No evaluators available" : "Select evaluator"} />
            </SelectTrigger>
            <SelectContent>
              {evaluators.map((evaluator) => (
                <SelectItem key={evaluator.id} value={evaluator.id}>
                  <span>
                    {evaluator.name}
                    <span className="text-secondary-foreground text-xs ml-2">{evaluator.evaluatorType}</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button className="ml-auto" onClick={registerEvaluator} disabled={!selectedEvaluator || isLoading}>
            {isLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
            Register evaluator
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default RegisterEvaluatorPopover;
