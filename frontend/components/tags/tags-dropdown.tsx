"use client";

import { type PropsWithChildren, useState } from "react";

import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { type TagClass } from "@/lib/traces/types";

import CreateTag from "./create-tag";
import PickTag from "./pick-tag";

export type Tag = {
  id: string;
  name: string;
  color?: string;
};

export interface TagsDropdownCallbacks {
  onAttach: (tagClassName: string) => Promise<void>;
  onDetach: (tag: Tag) => Promise<void>;
  onCreateAndAttach: (name: string, color: string) => Promise<void>;
}

interface TagsDropdownProps extends TagsDropdownCallbacks {
  tags: Tag[];
  tagClasses: TagClass[];
}

const TagsDropdown = ({
  children,
  tags,
  tagClasses,
  onAttach,
  onDetach,
  onCreateAndAttach,
}: PropsWithChildren<TagsDropdownProps>) => {
  const [step, setStep] = useState<0 | 1>(0);
  const [query, setQuery] = useState("");

  return (
    <DropdownMenu
      onOpenChange={() => {
        setQuery("");
        setStep(0);
      }}
    >
      {children}
      <DropdownMenuContent className="max-h-96 overflow-y-auto" side="bottom" align="start">
        {step === 0 ? (
          <PickTag
            tags={tags}
            tagClasses={tagClasses}
            query={query}
            setQuery={setQuery}
            setStep={setStep}
            onAttach={onAttach}
            onDetach={onDetach}
          />
        ) : (
          <CreateTag name={query} onCreateAndAttach={onCreateAndAttach} />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default TagsDropdown;
