import { isEmpty } from "lodash";
import { Plus, Tag } from "lucide-react";

import { useLabelsContext } from "@/components/labels/labels-context";
import ManageLabels from "@/components/labels/manage-labels";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";

import { Button } from "../ui/button";

const LabelsList = () => {
  const { labels, labelClasses, isLoading } = useLabelsContext();

  return (
    <ManageLabels>
      <DropdownMenuTrigger asChild>
        <div className="flex flex-wrap w-fit items-center gap-2">
          {isLoading ? (
            <>
              <Skeleton className="h-5 w-12 rounded-3xl" />
              <Skeleton className="h-5 w-12 rounded-3xl" />
              <Skeleton className="h-5 w-12 rounded-3xl" />
            </>
          ) : !isEmpty(labels) ? (
            <>
              {labels.map((l) => (
                <Badge key={l.id} className="rounded-3xl" variant="outline">
                  <div
                    style={{ background: labelClasses?.find((c) => c.id === l.classId)?.color }}
                    className={`w-2 h-2 rounded-full`}
                  />
                  <span className="ml-1.5">{labelClasses?.find((c) => c.id === l.classId)?.name}</span>
                </Badge>
              ))}
              <Button className="w-5 h-5 rounded-full" variant="secondary" size="icon">
                <Plus size={12} />
              </Button>
            </>
          ) : (
            <Badge className="cursor-pointer" variant="secondary">
              <Tag className="size-3 mr-2" />
              <span className="text-xs">Add labels</span>
            </Badge>
          )}
        </div>
      </DropdownMenuTrigger>
    </ManageLabels>
  );
};

export default LabelsList;
