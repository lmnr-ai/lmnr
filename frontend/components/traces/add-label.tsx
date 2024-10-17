import { LabelClass, SpanLabel, LabelType, Span } from "@/lib/traces/types";
import { cn, swrFetcher } from "@/lib/utils";
import { useState } from "react";
import useSWR from "swr";
import { Label } from "../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { ArrowLeft, Loader, PlusCircle, Trash2 } from "lucide-react";
import { Input } from "../ui/input";
import { Button } from "../ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { useProjectContext } from "@/contexts/project-context";
import { Table, TableBody, TableCell, TableRow } from "../ui/table";
import DefaultTextarea from "../ui/default-textarea";
import { EvaluatorEditorDialog } from "../evaluator/evaluator-editor-dialog";
import { Switch } from "../ui/switch";

interface AddLabelProps {
  span: Span;
  onClose: () => void;
}

export function AddLabel({
  span,
  onClose,
}: AddLabelProps) {

  const { projectId } = useProjectContext();
  const [selectedType, setSelectedType] = useState<LabelType>(LabelType.BOOLEAN);
  const [isSaving, setIsSaving] = useState(false);
  const [showEvaluator, setShowEvaluator] = useState(false);

  const [labelClass, setLabelClass] = useState<LabelClass>({
    id: '',
    name: '',
    projectId: projectId,
    createdAt: '',
    labelType: LabelType.BOOLEAN,
    valueMap: [],
    description: null,
    evaluatorRunnableGraph: null
  });

  const isLabelValueMapValid = labelClass.valueMap.length > 0 && labelClass.valueMap.every(value => value.length > 0);

  const saveLabel = async () => {
    setIsSaving(true);

    const res = await fetch(`/api/projects/${projectId}/label-classes`, {
      method: 'POST',
      body: JSON.stringify(labelClass),
    });

    if (!res.ok) {
    }

    const resultLabelClass = await res.json();

    if (resultLabelClass.evaluatorRunnableGraph) {

      const registeredPaths = await fetch(`/api/projects/${projectId}/label-classes/${resultLabelClass.id}/registered-paths`, {
        method: 'POST',
        body: JSON.stringify({
          path: span.attributes["lmnr.span.path"]
        }),
      });

      if (!registeredPaths.ok) {
        console.error('Failed to register paths');
      }

    }

    onClose();

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
        <Input type="text" placeholder="Label name" onChange={e => setLabelClass({ ...labelClass, name: e.target.value })} />
      </div>
      <div className="flex-col space-y-2">
        <Label className="flex">Description (optional)</Label>
        <DefaultTextarea
          className="flex w-full"
          placeholder="Label description"
          onChange={e => setLabelClass({ ...labelClass, description: e.target.value })}
          minRows={3}
        />
      </div>
      <div className="flex-col space-y-1">
        <Label>Type</Label>
        <Select onValueChange={labelType => {
          setSelectedType(labelType as LabelType);

          if (labelType === LabelType.BOOLEAN) {
            setLabelClass({ ...labelClass, valueMap: ["false", "true"] });
          }
        }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select label type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={LabelType.BOOLEAN}>Boolean</SelectItem>
            <SelectItem value={LabelType.CATEGORICAL}>Categorical</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {selectedType === LabelType.CATEGORICAL &&
        (<div className="flex flex-col space-y-2">
          <div className="flex-col space-y-1">
            <Label>Categorical values</Label>
          </div>

          {labelClass.valueMap.map((value, index) => (
            <div key={index} className="flex space-x-2">
              <Input type="text" placeholder="Categorical value" onChange={e => setLabelClass({ ...labelClass, valueMap: labelClass.valueMap.map((value, i) => i === index ? e.target.value : value) })} />
              <Button variant="ghost" size="icon" onClick={() => setLabelClass({ ...labelClass, valueMap: labelClass.valueMap.filter((_, i) => i !== index) })}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={() => setLabelClass({ ...labelClass, valueMap: [...labelClass.valueMap, ''] })}>Add categorical value</Button>
        </div>)}
      <div className="flex flex-col space-y-2">
        <div>
          <div className="flex items-center justify-between">
            <Label>Evaluator</Label>
            <Switch
              checked={showEvaluator}
              onCheckedChange={setShowEvaluator}
            />
          </div>
          <div className="text-secondary-foreground/80 text-sm">
            Online evaluator that takes a span and returns a label
          </div>
        </div>
        {showEvaluator && (
          <>
            <EvaluatorEditorDialog
              span={span}
              labelClass={labelClass}
              onEvaluatorAdded={(evaluatorRunnableGraph) => {
                console.log(evaluatorRunnableGraph);
                setLabelClass({ ...labelClass, evaluatorRunnableGraph: evaluatorRunnableGraph.toObject() });
              }}
            >
              <Button variant="secondary">
                {labelClass.evaluatorRunnableGraph ? 'Edit evaluator' : 'Add evaluator'}
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
          disabled={!labelClass.name || !isLabelValueMapValid}
        >
          <Loader className={isSaving ? 'animate-spin h-4 w-4 mr-2' : 'hidden'} />
          Add
        </Button>
      </div>
    </div>
  );
}
