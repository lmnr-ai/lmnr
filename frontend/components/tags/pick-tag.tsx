"use client";
import { type CheckedState } from "@radix-ui/react-checkbox";
import { isEmpty } from "lodash";
import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
import { type Dispatch, type SetStateAction, useMemo } from "react";

import { useTagsContext } from "@/components/tags/tags-context";
import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { type SpanTag, type TagClass } from "@/lib/traces/types";

interface PickTagProps {
  setStep: Dispatch<SetStateAction<0 | 1>>;
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
}
const PickTag = ({ setStep, query, setQuery }: PickTagProps) => {
  const params = useParams();
  const { tags, tagClasses, mutate, mode } = useTagsContext();
  const { toast } = useToast();
  const { selected, available, hasExactMatch } = useMemo(() => {
    const selectedNames = tags.map(({ name }) => name);
    const selected = tagClasses.filter((tag) => selectedNames.includes(tag.name));
    const available = tagClasses.filter((tag) => !selectedNames.includes(tag.name));

    const searchLower = query.toLowerCase();
    const filteredSelected = selected.filter((tag) => tag.name.toLowerCase().includes(searchLower));
    const filteredAvailable = available.filter((tag) => tag.name.toLowerCase().includes(searchLower));

    const hasExactMatch = [...selected, ...available].some((tag) => tag.name.toLowerCase() === searchLower);

    return {
      selected: filteredSelected,
      available: filteredAvailable,
      hasExactMatch,
    };
  }, [tagClasses, tags, query]);

  const handleCheckTag = (tagClass: TagClass) => async (checked: CheckedState) => {
    try {
      if (checked) {
        let attachUrl: string;
        let body: Record<string, string>;

        if (mode.type === "span") {
          attachUrl = `/api/projects/${params?.projectId}/spans/${mode.spanId}/tags`;
          body = { name: tagClass.name };
        } else {
          attachUrl = `/api/projects/${params?.projectId}/traces/${mode.traceId}/tags`;
          body = { tagName: tagClass.name };
        }

        const res = await fetch(attachUrl, {
          method: "POST",
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          toast({ variant: "destructive", title: "Error", description: "Failed to attach tag." });
          return;
        }

        if (mode.type === "span") {
          const data = (await res.json()) as SpanTag;
          await mutate([...tags, data], {
            revalidate: false,
          });
        } else {
          // Trace mode: API returns updated tag names array
          // Revalidate to get the fresh list
          await mutate();
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  };

  const deleteTag = async (tag: SpanTag) => {
    let deleteUrl: string;
    if (mode.type === "span") {
      deleteUrl = `/api/projects/${params?.projectId}/spans/${mode.spanId}/tags/${tag.id}`;
    } else {
      deleteUrl = `/api/projects/${params?.projectId}/traces/${mode.traceId}/tags/${encodeURIComponent(tag.name)}`;
    }
    const res = await fetch(deleteUrl, {
      method: "DELETE",
    });
    if (!res.ok) {
      const errMessage = await res
        .json()
        .then((d) => d?.error)
        .catch(() => null);
      throw new Error(errMessage ?? "Failed to delete tag");
    }
    return [tag];
  };

  const handleUncheckTag = (tag?: SpanTag) => async (checked: CheckedState) => {
    try {
      if (!checked && tag) {
        if (mode.type === "span") {
          await mutate(deleteTag(tag), {
            optimisticData: [...tags.filter((l) => l.id !== tag.id)],
            rollbackOnError: true,
            populateCache: (updatedData, original) => [
              ...(original ?? []).filter((item) => !updatedData.map((u) => u.id).includes(item.id)),
            ],
            revalidate: false,
          });
        } else {
          // Trace mode: delete then revalidate to get the fresh string[] from API
          await deleteTag(tag);
          await mutate();
        }
      }
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    }
  };

  return (
    <>
      <Input
        autoFocus
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Add tags..."
        className="border-none bg-transparent focus-visible:ring-0 flex-1 h-fit rounded-none"
      />

      {(!isEmpty(selected) || !isEmpty(available)) && <DropdownMenuSeparator />}

      {!isEmpty(selected) && <SelectedTags tags={selected} onCheck={handleUncheckTag} spanTags={tags} />}

      {!isEmpty(selected) && !isEmpty(available) && <DropdownMenuSeparator />}

      {!isEmpty(available) && <AvailableTags tags={available} onCheck={handleCheckTag} />}
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
              Create new tag: <span className="text-left">&#34;{query}&#34;</span>
            </DropdownMenuItem>
          </DropdownMenuGroup>
        </>
      )}
    </>
  );
};

export default PickTag;

const AvailableTags = ({
  tags,
  onCheck,
}: {
  tags: TagClass[];
  onCheck: (tagClass: TagClass) => (checked: CheckedState) => Promise<void>;
}) => (
  <DropdownMenuGroup>
    {tags.map((tag) => (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={tag.name}>
        <Checkbox
          checked={false}
          onCheckedChange={onCheck(tag)}
          className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
        />
        <div style={{ background: tag.color }} className={`w-2 h-2 rounded-full`} />
        <span>{tag.name}</span>
      </DropdownMenuItem>
    ))}
  </DropdownMenuGroup>
);

const SelectedTags = ({
  tags: tags,
  onCheck,
  spanTags: spanTags,
}: {
  tags: TagClass[];
  onCheck: (tag?: SpanTag) => (checked: CheckedState) => Promise<void>;
  spanTags: SpanTag[];
}) => (
  <DropdownMenuGroup>
    {tags.map((tag) => (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={tag.name}>
        <Checkbox
          onCheckedChange={onCheck(spanTags.find((s) => s.name === tag.name))}
          checked
          className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
        />
        <div style={{ background: tag.color }} className={`w-2 h-2 rounded-full`} />
        <span>{tag.name}</span>
      </DropdownMenuItem>
    ))}
  </DropdownMenuGroup>
);
