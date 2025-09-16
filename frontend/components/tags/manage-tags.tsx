"use client";
import { PropsWithChildren, useMemo, useState } from "react";

import CreateTag from "@/components/tags/create-tag";
import PickTag from "@/components/tags/pick-tag";
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";

const ManageTags = ({ children }: PropsWithChildren) => {
  const [step, setStep] = useState<0 | 1>(0);
  const [query, setQuery] = useState("");

  const renderStep = useMemo(
    () => ({
      0: <PickTag query={query} setQuery={setQuery} setStep={setStep} />,
      1: <CreateTag name={query} />,
    }),
    [query]
  );

  return (
    <DropdownMenu
      onOpenChange={() => {
        setQuery("");
        setStep(0);
      }}
    >
      {children}
      <DropdownMenuContent side="bottom" align="start">
        {renderStep[step]}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ManageTags;
