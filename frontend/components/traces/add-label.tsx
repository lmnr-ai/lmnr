import { LabelClass, SpanLabel, LabelType } from "@/lib/traces/types";
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

interface AddLabelProps {
  spanId: string;
  onClose: () => void;
}

export function AddLabel({
  spanId,
  onClose,
}: AddLabelProps) {

  const { projectId } = useProjectContext();
  const [selectedType, setSelectedType] = useState<LabelType>(LabelType.BOOLEAN);
  const [typeName, setTypeName] = useState<string>('');
  const [typeId, setTypeId] = useState<string>('');
  const [value, setValue] = useState<string | number | boolean>('');
  const [isSaving, setIsSaving] = useState(false);
  const [valueMap, setValueMap] = useState<string[]>(["", ""]);

  const saveLabel = async () => {
    setIsSaving(true);
    let labelTypeId = typeId;
    let newLabel: LabelClass;

    const res = await fetch(`/api/projects/${projectId}/label-classes`, {
      method: 'POST',
      body: JSON.stringify({
        name: typeName,
        labelType: selectedType,
        valueMap
      }),
    });
    newLabel = await res.json() as LabelClass;

    labelTypeId = newLabel.id;

    setIsSaving(false);
    onClose();
  }

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
        <Input type="text" placeholder="Label name" onChange={e => setTypeName(e.target.value)} />
      </div>
      <div className="flex-col space-y-1">
        <Label>Type</Label>
        <Select onValueChange={labelType => {
          setSelectedType(labelType as LabelType)

          if (labelType === LabelType.BOOLEAN) {
            setValueMap(["false", "true"]);
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

          {valueMap.map((value, index) => (
            <div key={index} className="flex space-x-2">
              <Input type="text" placeholder="Categorical value" onChange={e => setValueMap(valueMap.map((value, i) => i === index ? e.target.value : value))} />
              <Button variant="ghost" size="icon" onClick={() => setValueMap(valueMap.filter((_, i) => i !== index))}>
                <Trash2 size={14} />
              </Button>
            </div>
          ))}
          <Button variant="outline" onClick={() => setValueMap([...valueMap, ''])}>Add categorical value</Button>
        </div>)}
      <div className="flex space-x-2 pt-2 justify-end">
        <Button
          variant="default"
          onClick={async () => {
            await saveLabel();
          }}
        >
          <Loader className={isSaving ? 'animate-spin h-4 w-4 mr-2' : 'hidden'} />
          Add
        </Button>
      </div>
    </div>
  )
}