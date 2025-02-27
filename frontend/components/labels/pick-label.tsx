import { CheckedState } from "@radix-ui/react-checkbox";
import { isEmpty } from "lodash";
import { Plus } from "lucide-react";
import { useParams, useSearchParams } from "next/navigation";
import { Dispatch, SetStateAction, useMemo } from "react";
import { useSWRConfig } from "swr";

import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LabelClass, SpanLabel } from "@/lib/traces/types";

interface PickLabelProps {
  labels: LabelClass[];
  spanLabels: SpanLabel[];
  setStep: Dispatch<SetStateAction<0 | 1>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
}
const PickLabel = ({ labels, spanLabels, setStep, query, setQuery }: PickLabelProps) => {
  const params = useParams();
  const searchParams = useSearchParams();
  const { selected, available, hasExactMatch } = useMemo(() => {
    const selectedIds = spanLabels.map(({ classId }) => classId);
    const selected = labels
      .filter((label) => selectedIds.includes(label.id))
      .map((label) => ({ ...label, labelId: spanLabels.find(({ classId }) => classId === label.id)?.id }));
    const available = labels.filter((label) => !selectedIds.includes(label.id));

    const searchLower = query.toLowerCase();
    const filteredSelected = selected.filter((label) => label.name.toLowerCase().includes(searchLower));
    const filteredAvailable = available.filter((label) => label.name.toLowerCase().includes(searchLower));

    const hasExactMatch = [...selected, ...available].some((label) => label.name.toLowerCase() === searchLower);

    return {
      selected: filteredSelected,
      available: filteredAvailable,
      hasExactMatch,
    };
  }, [labels, spanLabels, query]);

  const { mutate } = useSWRConfig();
  const handleCheckLabel = (classId: string) => async (checked: CheckedState) => {
    try {
      if (Boolean(checked)) {
        const res = await fetch(`/api/projects/${params?.projectId}/spans/${searchParams.get("spanId")}/labels`, {
          method: "POST",
          body: JSON.stringify({
            classId,
            reasoning: "",
          }),
        });
        const data = (await res.json()) as SpanLabel;

        await mutate(
          `/api/projects/${params?.projectId}/spans/${searchParams.get("spanId")}/labels`,
          [...spanLabels, data],
          false
        );
      }
    } catch (e) {
      // TODO: add toast
      console.error(e);
    }
  };

  const handleUncheckLabel = (id?: string) => async (checked: CheckedState) => {
    try {
      if (!checked && id) {
        await fetch(`/api/projects/${params?.projectId}/spans/${searchParams.get("spanId")}/labels/${id}`, {
          method: "DELETE",
        });
        await mutate(
          `/api/projects/${params?.projectId}/spans/${searchParams.get("spanId")}/labels`,
          [...spanLabels.filter((l) => l.id !== id)],
          false
        );
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

      <>
        {!isEmpty(selected) && (
          <>
            <DropdownMenuGroup>
              {selected.map((l) => (
                <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={l.id}>
                  <Checkbox
                    onCheckedChange={handleUncheckLabel(l.labelId)}
                    checked
                    className="border border-secondary mr-2"
                  />
                  <div style={{ background: String(l.color) }} className={`w-2 h-2 rounded-full`} />
                  <span className="ml-1.5">{l.name}</span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </>
        )}
      </>
      {!isEmpty(selected) && !isEmpty(available) && <DropdownMenuSeparator />}
      {!isEmpty(available) && (
        <>
          <DropdownMenuGroup>
            {available.map((l) => (
              <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={l.id}>
                <Checkbox
                  checked={false}
                  onCheckedChange={handleCheckLabel(l.id)}
                  className="border border-secondary mr-2"
                />
                <div style={{ background: String(l.color) }} className={`w-2 h-2 rounded-full`} />
                <span className="ml-1.5">{l.name}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        </>
      )}
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
