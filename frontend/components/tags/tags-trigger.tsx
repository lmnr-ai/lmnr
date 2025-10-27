import React from "react";

import ManageTags from "@/components/tags/manage-tags";
import { Button } from "@/components/ui/button.tsx";
import { DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const Tags = () => (
  <ManageTags>
    <DropdownMenuTrigger asChild>
      <Button size="sm" icon="tag" variant="secondary">
        <span>Tags</span>
      </Button>
    </DropdownMenuTrigger>
  </ManageTags>
);

export default Tags;
