import { PropsWithChildren, useMemo, useState } from "react";

import CreateLabel from "@/components/labels/create-label";
import PickLabel from "@/components/labels/pick-label";
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";

const ManageLabels = ({ children }: PropsWithChildren) => {
  const [step, setStep] = useState<0 | 1>(0);
  const [query, setQuery] = useState("");

  const renderStep = useMemo(
    () => ({
      0: <PickLabel query={query} setQuery={setQuery} setStep={setStep} />,
      1: <CreateLabel name={query} />,
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

export default ManageLabels;
