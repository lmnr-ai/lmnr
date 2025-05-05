import { Tag } from "lucide-react";
import React from "react";

import ManageLabels from "@/components/labels/manage-labels";
import { Badge } from "@/components/ui/badge";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const LabelsTrigger = () => (
  <ManageLabels>
    <DropdownMenuTrigger asChild>
      <Badge className="cursor-pointer" variant="secondary">
        <Tag className="size-3 mr-2" />
        <span className="text-xs">Add labels</span>
      </Badge>
    </DropdownMenuTrigger>
  </ManageLabels>
);

export default LabelsTrigger;
