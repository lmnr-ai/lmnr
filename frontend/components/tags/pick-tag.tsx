"use client";

import { isEmpty } from "lodash";
import { Plus } from "lucide-react";
import { type Dispatch, type SetStateAction, useMemo } from "react";

import { Checkbox } from "@/components/ui/checkbox";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { type TagClass } from "@/lib/traces/types";

import { type Tag } from "./tags-dropdown";

interface PickTagProps {
  tags: Tag[];
  tagClasses: TagClass[];
  query: string;
  setQuery: Dispatch<SetStateAction<string>>;
  setStep: Dispatch<SetStateAction<0 | 1>>;
  onAttach: (tagClassName: string) => Promise<void>;
  onDetach: (tag: Tag) => Promise<void>;
}

const PickTag = ({ tags, tagClasses, query, setQuery, setStep, onAttach, onDetach }: PickTagProps) => {
  const { selected, available, hasExactMatch } = useMemo(() => {
    const searchLower = query.toLowerCase();
    const tagNames = new Set(tags.map((t) => t.name));

    // Build selected from actual tags — always show them even without a tagClass
    const selected = tags
      .filter((t) => t.name.toLowerCase().includes(searchLower))
      .map((t) => {
        const tc = tagClasses.find((c) => c.name === t.name);
        return { ...t, color: t.color ?? tc?.color };
      });

    // Available = tagClasses not currently attached
    const available = tagClasses
      .filter((tc) => !tagNames.has(tc.name))
      .filter((tc) => tc.name.toLowerCase().includes(searchLower));

    const allNames = [...tagNames, ...tagClasses.map((tc) => tc.name)];
    const hasExactMatch = allNames.some((name) => name.toLowerCase() === searchLower);

    return { selected, available, hasExactMatch };
  }, [tagClasses, tags, query]);

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

      {!isEmpty(selected) && <SelectedTags tags={selected} onDetach={onDetach} />}

      {!isEmpty(selected) && !isEmpty(available) && <DropdownMenuSeparator />}

      {!isEmpty(available) && <AvailableTags tags={available} onAttach={onAttach} />}
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

const AvailableTags = ({ tags, onAttach }: { tags: TagClass[]; onAttach: (tagClassName: string) => Promise<void> }) => (
  <DropdownMenuGroup>
    {tags.map((tag) => (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={tag.name}>
        <Checkbox
          checked={false}
          onCheckedChange={(checked) => {
            if (checked) onAttach(tag.name);
          }}
          className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
        />
        <div
          style={tag.color ? { background: tag.color } : undefined}
          className={`w-2 h-2 rounded-full ${!tag.color ? "bg-gray-300" : ""}`}
        />
        <span>{tag.name}</span>
      </DropdownMenuItem>
    ))}
  </DropdownMenuGroup>
);

const SelectedTags = ({ tags, onDetach }: { tags: Tag[]; onDetach: (tag: Tag) => Promise<void> }) => (
  <DropdownMenuGroup>
    {tags.map((tag) => (
      <DropdownMenuItem onSelect={(e) => e.preventDefault()} key={tag.name}>
        <Checkbox
          onCheckedChange={(checked) => {
            if (!checked) onDetach(tag);
          }}
          checked
          className="[&_svg]:!text-primary-foreground [&_svg]:!size-[10px]"
        />
        <div
          style={tag.color ? { background: tag.color } : undefined}
          className={`w-2 h-2 rounded-full ${!tag.color ? "bg-gray-300" : ""}`}
        />
        <span>{tag.name}</span>
      </DropdownMenuItem>
    ))}
  </DropdownMenuGroup>
);
