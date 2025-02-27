import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { useSWRConfig } from "swr";

import { DropdownMenuGroup, DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { LabelClass } from "@/lib/traces/types";

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
  labels: LabelClass[];
}

const CreateLabel = ({ name, labels }: CreateLabelProps) => {
  const [query, setQuery] = useState("");
  const params = useParams();
  const colors = useMemo(
    () => defaultColors.filter((label) => label.name.toLowerCase().includes(query.toLowerCase())),
    [query]
  );

  const { mutate } = useSWRConfig();
  const handleCreateLabelClass = async (color: string) => {
    try {
      const response = await fetch(`/api/projects/${params?.projectId}/label-classes`, {
        method: "POST",
        body: JSON.stringify({
          projectId: params?.projectId,
          name,
          description: "",
          evaluatorRunnableGraph: "",
          color,
        }),
      });
      const data = (await response.json()) as LabelClass;
      // {
      //   "id": "94e05544-9f66-4874-8822-02546eae1e67",
      //     "createdAt": "2025-02-27 14:33:44.635844+00",
      //     "name": "okay lets go",
      //     "projectId": "54099983-3e7e-425d-bd7b-4823c57820f4",
      //     "description": "",
      //     "evaluatorRunnableGraph": "",
      //     "pipelineVersionId": null,
      //     "color": "rgb(38, 181, 206)"
      // }
      await mutate(`/api/projects/${params?.projectId}/label-classes`, [...labels, data], false);
    } catch (e) {
      console.error(e);
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
