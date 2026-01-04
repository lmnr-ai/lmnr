import { includes, isEmpty, map, partition } from "lodash";
import { ChevronDown } from "lucide-react";
import { useParams } from "next/navigation";
import { type ReactNode, useMemo } from "react";
import useSWR from "swr";

import { Button } from "@/components/ui/button.tsx";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type Evaluator } from "@/lib/evaluators/types";
import { useToast } from "@/lib/hooks/use-toast";
import { type PaginatedResponse } from "@/lib/types";
import { swrFetcher } from "@/lib/utils";

interface RegisterEvaluatorPopoverProps {
  spanPath: string[];
  children?: ReactNode;
}

const RegisterEvaluatorPopover = ({ spanPath, children }: RegisterEvaluatorPopoverProps) => {
  const { projectId } = useParams();
  const { toast } = useToast();

  const { data } = useSWR<PaginatedResponse<Evaluator>>(
    `/api/projects/${projectId}/evaluators?pageSize=100`,
    swrFetcher
  );

  const { data: spanPathEvaluators, mutate: mutateAttachedEvaluators } = useSWR<
    Pick<Evaluator, "id" | "name" | "evaluatorType">[]
  >(
    `/api/projects/${projectId}/evaluators/span-path?spanPath=${encodeURIComponent(JSON.stringify(spanPath))}`,
    swrFetcher
  );

  const { attachedEvaluators, unattachedEvaluators } = useMemo(() => {
    if (!data?.items || !spanPathEvaluators) {
      return { attachedEvaluators: [], unattachedEvaluators: [] };
    }

    const attachedIds = map(spanPathEvaluators, "id");
    const [attached, unattached] = partition(data.items, (evaluator) => includes(attachedIds, evaluator.id));

    return {
      attachedEvaluators: attached,
      unattachedEvaluators: unattached,
    };
  }, [data?.items, spanPathEvaluators]);

  const handleRegisterEvaluator = async (id: string) => {
    try {
      const newEvaluator = data?.items.find((e) => e.id === id);
      if (!newEvaluator) return;

      await mutateAttachedEvaluators(
        async () => {
          const response = await fetch(`/api/projects/${projectId}/evaluators/${id}/span-path`, {
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

          return spanPathEvaluators
            ? [
                ...spanPathEvaluators,
                {
                  id: newEvaluator.id,
                  name: newEvaluator.name,
                  evaluatorType: newEvaluator.evaluatorType,
                },
              ]
            : [
                {
                  id: newEvaluator.id,
                  name: newEvaluator.name,
                  evaluatorType: newEvaluator.evaluatorType,
                },
              ];
        },
        {
          optimisticData: (current) =>
            current
              ? [
                  ...current,
                  {
                    id: newEvaluator.id,
                    name: newEvaluator.name,
                    evaluatorType: newEvaluator.evaluatorType,
                  },
                ]
              : [
                  {
                    id: newEvaluator.id,
                    name: newEvaluator.name,
                    evaluatorType: newEvaluator.evaluatorType,
                  },
                ],
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to register evaluator. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleUnregisterEvaluator = async (id: string) => {
    try {
      await mutateAttachedEvaluators(
        async () => {
          const response = await fetch(`/api/projects/${projectId}/evaluators/${id}/span-path`, {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              spanPath,
            }),
          });

          if (!response.ok) {
            throw new Error("Failed to remove evaluator");
          }

          return spanPathEvaluators ? spanPathEvaluators.filter((e) => e.id !== id) : [];
        },
        {
          optimisticData: (current) => (current ? current.filter((e) => e.id !== id) : []),
          rollbackOnError: true,
          revalidate: false,
        }
      );
    } catch (e) {
      toast({
        title: "Error",
        description: e instanceof Error ? e.message : "Failed to remove evaluator. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {children || (
          <Button size="sm" icon="squareFunction" variant="secondary">
            <span>Evaluators</span>
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="bottom" align="end">
        <DropdownMenuLabel className="text-xs p-1 flex flex-col">
          <span className="text-xs font-normal pb-1">Span path</span>
          <div className="flex flex-col gap-1">
            {spanPath.map((path, index) => (
              <div key={`${path}-${index}`} className="flex items-center gap-1">
                <ChevronDown className="text-muted-foreground" size={16} />
                <span className="text-xs text-secondary-foreground font-normal">{path}</span>
              </div>
            ))}
          </div>
        </DropdownMenuLabel>

        {(!isEmpty(attachedEvaluators) || !isEmpty(unattachedEvaluators)) && <DropdownMenuSeparator />}
        <EvaluatorsList
          label="Registered evaluators at path"
          checked
          evaluators={attachedEvaluators}
          onCheck={handleUnregisterEvaluator}
        />
        {!isEmpty(attachedEvaluators) && !isEmpty(unattachedEvaluators) && <DropdownMenuSeparator />}
        <EvaluatorsList evaluators={unattachedEvaluators} onCheck={handleRegisterEvaluator} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RegisterEvaluatorPopover;

const EvaluatorsList = ({
  evaluators,
  checked,
  onCheck,
  label,
}: {
  evaluators: Evaluator[];
  checked?: boolean;
  onCheck: (id: string) => void;
  label?: string;
}) => {
  if (isEmpty(evaluators)) {
    return null;
  }

  return (
    <>
      {label && <DropdownMenuLabel className="text-xs p-1 font-normal">{label}</DropdownMenuLabel>}
      <DropdownMenuGroup>
        {evaluators.map((evaluator) => (
          <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={evaluator.id}>
            <Checkbox
              checked={checked}
              onCheckedChange={() => onCheck(evaluator.id)}
              className="border border-secondary mr-2"
            />
            <span className="ml-1.5">{evaluator.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  );
};
