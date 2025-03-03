import { CheckedState } from "@radix-ui/react-checkbox";
import { isEmpty } from "lodash";
import { Plus } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { Dispatch, SetStateAction, useMemo } from "react";

import { useLabelsContext } from "@/components/labels/labels-context";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LabelClass, SpanLabel } from "@/lib/traces/types";

interface PickLabelProps {
  setStep: Dispatch<SetStateAction<0 | 1>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
}
const PickLabel = ({ setStep, query, setQuery }: PickLabelProps) => {
  const params = useParams();
  const searchParams = useSearchParams();
  const { labels, labelClasses, mutate } = useLabelsContext();

  const { selected, available, hasExactMatch } = useMemo(() => {
    const selectedIds = labels.map(({ classId }) => classId);
    const selected = labelClasses.filter((label) => selectedIds.includes(label.id));
    const available = labelClasses.filter((label) => !selectedIds.includes(label.id));

    const searchLower = query.toLowerCase();
    const filteredSelected = selected.filter((label) => label.name.toLowerCase().includes(searchLower));
    const filteredAvailable = available.filter((label) => label.name.toLowerCase().includes(searchLower));

    const hasExactMatch = [...selected, ...available].some((label) => label.name.toLowerCase() === searchLower);

    return {
      selected: filteredSelected,
      available: filteredAvailable,
      hasExactMatch,
    };
  }, [labelClasses, labels, query]);

  const handleCheckLabel = (labelClass: LabelClass) => async (checked: CheckedState) => {
    try {
      if (Boolean(checked)) {
        const res = await fetch(`/api/projects/${params?.projectId}/spans/${searchParams.get("spanId")}/labels`, {
          method: "POST",
          body: JSON.stringify({
            classId: labelClass.id,
            name: labelClass.name,
            reasoning: "",
          }),
        });

        const data = (await res.json()) as SpanLabel;

        await mutate([...labels, data], {
          revalidate: false,
        });
      }
    } catch (e) {
      // TODO: add toast
      console.error(e);
    }
  };

  const deleteLabel = async (label: SpanLabel) => {
    await fetch(`/api/projects/${params?.projectId}/spans/${searchParams.get("spanId")}/labels/${label.id}`, {
      method: "DELETE",
    });
    return [label];
  };

  const handleUncheckLabel = (label?: SpanLabel) => async (checked: CheckedState) => {
    try {
      if (!checked && label) {
        await mutate(deleteLabel(label), {
          optimisticData: [...labels.filter((l) => l.id !== label.id)],
          rollbackOnError: true,
          populateCache: (updatedData, original) => [
            ...(original ?? []).filter((item) => !updatedData.map((u) => u.id).includes(item.id)),
          ],
          revalidate: false,
        });
      }
    } catch (e) {
      // TODO: add toast
      console.error(e);
    }
  };

  return (
    <>
      <Input
        autoFocus
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add labels..."
        className="border-none bg-transparent focus-visible:ring-0 flex-1 h-fit rounded-none"
      />

      {(!isEmpty(selected) || !isEmpty(available)) && <DropdownMenuSeparator />}

      {!isEmpty(selected) && <SelectedLabels labels={selected} onCheck={handleUncheckLabel} spanLabels={labels} />}

      {!isEmpty(selected) && !isEmpty(available) && <DropdownMenuSeparator />}

      {!isEmpty(available) && <AvailableLabels labels={available} onCheck={handleCheckLabel} />}
      {query && !hasExactMatch && available.length + selected.length < 5 && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                setStep(1);
              }}
            >
              <Plus size={16} className="mr-2" />
              Create new label: <span className="text-left">&#34;{query}&#34;</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>
      )}
    </>
  );
};

export default PickLabel;

const AvailableLabels = ({
  labels,
  onCheck,
}: {
  labels: LabelClass[];
  onCheck: (labelClass: LabelClass) => (checked: CheckedState) => Promise<void>;
}) => (
  <DropdownMenuGroup>
    {labels.map((label) => (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={label.id}>
        <Checkbox checked={false} onCheckedChange={onCheck(label)} className="border border-secondary mr-2" />
        <div style={{ background: label.color }} className={`w-2 h-2 rounded-full`} />
        <span className="ml-1.5">{label.name}</span>
      </DropdownMenuItem>
    ))}
  </DropdownMenuGroup>
);

const SelectedLabels = ({
  labels,
  onCheck,
  spanLabels,
}: {
  labels: LabelClass[];
  onCheck: (label?: SpanLabel) => (checked: CheckedState) => Promise<void>;
  spanLabels: SpanLabel[];
}) => (
  <DropdownMenuGroup>
    {labels.map((label) => (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={label.id}>
        <Checkbox
          onCheckedChange={onCheck(spanLabels.find((s) => s.classId === label.id))}
          checked
          className="border border-secondary mr-2"
        />
        <div style={{ background: label.color }} className={`w-2 h-2 rounded-full`} />
        <span className="ml-1.5">{label.name}</span>
      </DropdownMenuItem>
    ))}
  </DropdownMenuGroup>
);
