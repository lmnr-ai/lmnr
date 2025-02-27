import { PropsWithChildren, useMemo, useState } from "react";

import CreateLabel from "@/components/labels/create-label";
import PickLabel from "@/components/labels/pick-label";
import { DropdownMenu, DropdownMenuContent } from "@/components/ui/dropdown-menu";
import { LabelClass, SpanLabel } from "@/lib/traces/types";

interface ManageLabelsProps {
  labels: LabelClass[];
  spanLabels: SpanLabel[];
  spanId?: string;
}

const ManageLabels = ({ labels, spanLabels, children }: PropsWithChildren<ManageLabelsProps>) => {
  const [step, setStep] = useState<0 | 1>(0);

  const [query, setQuery] = useState("");

  const renderStep = useMemo(
    () => ({
      0: <PickLabel query={query} setQuery={setQuery} setStep={setStep} labels={labels} spanLabels={spanLabels} />,
      1: <CreateLabel labels={labels} name={query} />,
    }),
    [labels, query, spanLabels]
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
