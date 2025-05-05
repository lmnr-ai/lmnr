"use client";
import { useParams, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { useLabelsContext } from "@/components/labels/labels-context";
import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { useToast } from "@/lib/hooks/use-toast";
import { LabelClass, SpanLabel } from "@/lib/traces/types";

const defaultColors: { color: string; name: string }[] = [
  {
    color: "rgb(190, 194, 200)",
    name: "Grey",
  },
  {
    color: "rgb(149, 162, 179)",
    name: "Dark Grey",
  },
  {
    color: "lch(48 59.31 288.43)",
    name: "Purple",
  },
  {
    color: "rgb(38, 181, 206)",
    name: "Teal",
  },
  {
    color: "rgb(76, 183, 130)",
    name: "Green",
  },
  {
    color: "lch(80 90 85)",
    name: "Yellow",
  },
  {
    color: "rgb(242, 153, 74)",
    name: "Orange",
  },
  {
    color: "rgb(247, 200, 193)",
    name: "Pink",
  },
  {
    color: "rgb(235, 87, 87)",
    name: "Red",
  },
];

interface CreateLabelProps {
  name: string;
}

const CreateLabel = ({ name }: CreateLabelProps) => {
  const [query, setQuery] = useState("");
  const searchParams = useSearchParams();
  const params = useParams();
  const colors = useMemo(
    () => defaultColors.filter((label) => label.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const { toast } = useToast();
  const { labelClasses, mutateLabelClass, mutate, labels } = useLabelsContext();

  const handleCreateLabelClass = async (color: string) => {
    try {
      const response = await fetch(`/api/projects/${params?.projectId}/label-classes`, {
        method: "POST",
        body: JSON.stringify({
          name,
          description: "",
          evaluatorRunnableGraph: "",
          color,
        }),
      });

      if (!response.ok) {
        toast({ variant: "destructive", title: "Error", description: "Failed to create label." });
        return;
      }

      const data = (await response.json()) as LabelClass;
      await mutateLabelClass([...labelClasses, data], {
        revalidate: false,
      });

      // attach label right away
      const res = await fetch(`/api/projects/${params?.projectId}/spans/${searchParams.get("spanId")}/labels`, {
        method: "POST",
        body: JSON.stringify({
          classId: data.id,
          name: data.name,
          reasoning: "",
        }),
      });

      if (!res.ok) {
        toast({ variant: "destructive", title: "Error", description: "Failed to attach label." });
        return;
      }
      const label = (await res.json()) as SpanLabel;

      await mutate([...labels, label], {
        revalidate: false,
      });
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
        placeholder="Pick a color for label..."
        className="border-none bg-transparent focus-visible:ring-0 flex-1 h-fit rounded-none"
      />
      <DropdownMenuSeparator />
      <DropdownMenuGroup>
        {colors.map((c) => (
          <DropdownMenuItem onSelect={() => handleCreateLabelClass(c.color)} key={c.name}>
            <div style={{ background: c.color }} className={`w-2 h-2 rounded-full`} />
            <span className="ml-1.5">{c.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuGroup>
    </>
  );
};

export default CreateLabel;
