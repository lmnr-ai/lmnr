import { Plus } from "lucide-react";
import { useParams } from "next/navigation";
import useSWR from "swr";

import ManageLabels from "@/components/labels/manage-labels";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { LabelClass, SpanLabel } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";

interface LabelsListProps {
  spanId?: string;
}

const LabelsList = ({ spanId }: LabelsListProps) => {
  const params = useParams();
  const { data } = useSWR<LabelClass[]>(`/api/projects/${params?.projectId}/label-classes`, swrFetcher);
  const { data: spanLabels = [], isLoading } = useSWR<SpanLabel[]>(
    spanId ? `/api/projects/${params?.projectId}/spans/${spanId}/labels` : null,
    swrFetcher
  );

  console.log(spanLabels);
  return (
    <ManageLabels spanLabels={spanLabels} labels={data ?? []}>
      <DropdownMenuTrigger asChild>
        <div className="flex flex-wrap w-fit items-center gap-2">
          {isLoading && (
            <>
              <Skeleton className="h-5 w-12 rounded-3xl" />
              <Skeleton className="h-5 w-12 rounded-3xl" />
              <Skeleton className="h-5 w-12 rounded-3xl" />
            </>
          )}
          {!isLoading &&
            spanLabels &&
            spanLabels.map((l) => (
              <Badge key={l.id} className="rounded-3xl" variant="outline">
                <div style={{ background: "lch(48 59.31 288.43)" }} className={`w-2 h-2 rounded-full`} />
                <span className="ml-1.5">{data?.find((c) => c.id === l.classId)?.name}</span>
              </Badge>
            ))}
          <Button className="w-5 h-5 rounded-full" variant="secondary" size="icon">
            <Plus size={12} />
          </Button>
        </div>
      </DropdownMenuTrigger>
    </ManageLabels>
  );
};

export default LabelsList;
