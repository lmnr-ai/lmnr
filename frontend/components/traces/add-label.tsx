import { LabelClass, LabelType, Span } from '@/lib/traces/types';
import { useState } from 'react';
import { Label } from '../ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '../ui/select';
import { ArrowLeft, Loader2, Trash2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { useProjectContext } from '@/contexts/project-context';
import DefaultTextarea from '../ui/default-textarea';
import { EvaluatorEditorDialog } from '../evaluator/evaluator-editor-dialog';
import { Switch } from '../ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "../ui/tooltip";
import { HelpCircle } from "lucide-react";

interface AddLabelProps {
  span: Span;
  onClose: () => void;
}

export function AddLabel({ span, onClose }: AddLabelProps) {
  const { projectId } = useProjectContext();
  const [selectedType, setSelectedType] = useState<LabelType>(
    LabelType.BOOLEAN
  );
  const [isSaving, setIsSaving] = useState(false);
  const [showEvaluator, setShowEvaluator] = useState(false);

  const [labelClass, setLabelClass] = useState<LabelClass>({
    id: '',
    name: '',
    projectId: projectId,
    createdAt: '',
    labelType: LabelType.CATEGORICAL,
    valueMap: {
      "False": 0,
      "True": 1
    },
    description: null,
    evaluatorRunnableGraph: null,
    pipelineVersionId: null
  });

  const [labelValuePairs, setLabelValuePairs] = useState<[string, number][]>([
    ["False", 0],
    ["True", 1]
  ]);

  const saveLabel = async () => {
    setIsSaving(true);
    const finalLabelClass = {
      ...labelClass,
      valueMap: Object.fromEntries(labelValuePairs)
    };

    const res = await fetch(`/api/projects/${projectId}/label-classes`, {
      method: 'POST',
      body: JSON.stringify(finalLabelClass)
    });

    if (!res.ok) {
    }

    const resultLabelClass = await res.json();

    if (resultLabelClass.evaluatorRunnableGraph) {
      const registeredPaths = await fetch(
        `/api/projects/${projectId}/label-classes/${resultLabelClass.id}/registered-paths`,
        {
          method: 'POST',
          body: JSON.stringify({
            path: span.attributes['lmnr.span.path']
          })
        }
      );

      if (!registeredPaths.ok) {
        console.error('Failed to register paths');
      }
    }

    onClose();
  };

  const hasDuplicateValues = () => {
    const values = labelValuePairs.map(([_, v]) => v);
    const keys = labelValuePairs.map(([k, _]) => k);
    return values.length !== new Set(values).size ||
      keys.length !== new Set(keys).size;
  };

  return (
    <div className="flex-col items-center space-y-2">
      <div className="flex items-center space-x-2">
        <Button variant="ghost" size="icon" onClick={onClose}>
          <ArrowLeft size={16} />
        </Button>
        <h2 className="text-lg font-medium">New label</h2>
      </div>
      <div className="flex-col space-y-1">
        <Label>Name</Label>
        <Input
          type="text"
          placeholder="Label name"
          onChange={(e) =>
            setLabelClass({ ...labelClass, name: e.target.value })
          }
        />
      </div>
      <div className="flex-col space-y-2">
        <Label className="flex">Description (optional)</Label>
        <DefaultTextarea
          className="flex w-full"
          placeholder="Label description"
          onChange={(e) =>
            setLabelClass({ ...labelClass, description: e.target.value })
          }
          minRows={1}
        />
      </div>

      <div className="flex flex-col space-y-2">
        <div className="flex-col space-y-1">
          <Label>Label values</Label>
          {hasDuplicateValues() && (
            <div className="text-sm text-destructive">
              Duplicate label names or numerical values are not allowed
            </div>
          )}
        </div>

        <table className="w-full">
          <thead>
            <tr className="text-sm text-secondary-foreground">
              <th className="text-left font-medium pb-2 w-full">Value</th>
              <th className="text-left font-medium pb-2">Numerical</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {labelValuePairs.map(([key, value], i) => (
              <tr key={i}>
                <td className="pr-2 pb-2">
                  <Input
                    type="text"
                    placeholder="Categorical value"
                    value={key}
                    onChange={(e) => {
                      setLabelValuePairs((oldPairs) => {
                        const newPairs = [...oldPairs];
                        newPairs[i] = [e.target.value, value];
                        return newPairs;
                      });
                    }}
                  />
                </td>
                <td className="pr-2 pb-2">
                  <Input
                    type="number"
                    className="w-24"
                    placeholder="#"
                    value={value}
                    onChange={(e) => {
                      setLabelValuePairs((oldPairs) => {
                        const newPairs = [...oldPairs];
                        newPairs[i] = [key, parseInt(e.target.value, 10)];
                        return newPairs;
                      });
                    }}
                  />
                </td>
                <td className="pb-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setLabelValuePairs((oldPairs) =>
                        oldPairs.filter((_, j) => j !== i)
                      );
                    }}
                  >
                    <Trash2 size={14} />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button
          variant="secondary"
          onClick={() => setLabelValuePairs((oldPairs) => [...oldPairs, ["", 0]])}
        >
          Add label value
        </Button>
      </div>
      <div className="flex flex-col space-y-2">
        <div>
          <div className="flex items-center gap-1 justify-between">
            <div className="text-secondary-foreground/80 text-sm flex items-center gap-2">
              <Label>Online evaluator</Label>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <HelpCircle className="h-4 w-4" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-[280px]">
                    <p>
                      LLM-as-a-judge or Python script evaluator that
                      is executed on all spans at this path and assigns a
                      label.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="bg-yellow-700 border border-yellow-500 text-yellow-300 text-xs font-medium px-2 py-0.5 rounded">
                Beta
              </span>
            </div>
            <Switch
              checked={showEvaluator}
              onCheckedChange={setShowEvaluator}
            />
          </div>
        </div>
        {showEvaluator && (
          <>
            <EvaluatorEditorDialog
              span={span}
              labelClass={labelClass}
              onEvaluatorAdded={(evaluatorRunnableGraph) => {
                console.log(evaluatorRunnableGraph);
                setLabelClass({
                  ...labelClass,
                  evaluatorRunnableGraph: evaluatorRunnableGraph.toObject()
                });
              }}
            >
              <Button variant="secondary">
                {labelClass.evaluatorRunnableGraph
                  ? 'Edit evaluator'
                  : 'Add evaluator'}
              </Button>
            </EvaluatorEditorDialog>
          </>
        )}
      </div>
      <div className="flex space-x-2 pt-2 justify-end">
        <Button
          variant="default"
          onClick={async () => {
            await saveLabel();
          }}
          disabled={!labelClass.name || labelValuePairs.length === 0 || hasDuplicateValues()}
        >
          <Loader2
            className={isSaving ? 'animate-spin h-4 w-4 mr-2' : 'hidden'}
          />
          Add
        </Button>
      </div>
    </div>
  );
}
