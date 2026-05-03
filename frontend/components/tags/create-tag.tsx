"use client";

import { useMemo, useState } from "react";

import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { defaultColors } from "@/lib/tags/colors";

interface CreateTagProps {
  name: string;
  onCreateAndAttach: (name: string, color: string) => Promise<void>;
}

const CreateTag = ({ name, onCreateAndAttach }: CreateTagProps) => {
  const [query, setQuery] = useState("");
  const colors = useMemo(
    () => defaultColors.filter((tag) => tag.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  return (
    <>
      <Input
        autoFocus
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Pick a color for tag..."
        className="border-none bg-transparent focus-visible:ring-0 flex-1 h-fit rounded-none"
      />
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {colors.map((c) => (
          <DropdownMenuItem onSelect={() => onCreateAndAttach(name, c.color)} key={c.name}>
            <div style={{ background: c.color }} className="w-2 h-2 rounded-full" />
            <span className="ml-1.5">{c.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  );
};

export default CreateTag;
