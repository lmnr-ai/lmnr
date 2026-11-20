import { Database } from "lucide-react";
import { useParams, useRouter } from "next/navigation";

import { LinkChip } from "@/components/traces/trace-view/span-reference";
import { nameToPath } from "@/lib/evaluation/trial-files";
import { type Evaluation } from "@/lib/evaluation/types";

/** The eval dataset a run used, as the chip Laminar Agent links app pages with; plain text until it's pushed. */
export default function DatasetCell({ evaluation }: { evaluation: Evaluation }) {
  const { projectId } = useParams<{ projectId: string }>();
  const router = useRouter();
  const name = evaluation.datasetV2Id;
  if (!name) return <span className="text-secondary-foreground">-</span>;
  if (!evaluation.datasetExists) return <span className="block truncate">{name}</span>;

  return (
    <LinkChip
      name={name}
      // No vertical padding, so the chip is as tall as plain text and the row keeps its height.
      className="py-0"
      icon={<Database className="size-3.5 shrink-0 text-secondary-foreground" />}
      onClick={() => router.push(`/project/${projectId}/eval-datasets/${nameToPath(name)}`)}
    />
  );
}
