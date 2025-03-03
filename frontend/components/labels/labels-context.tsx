import { useParams, useSearchParams } from "next/navigation";
import { createContext, PropsWithChildren, useContext, useMemo } from "react";
import useSWR, { KeyedMutator } from "swr";

import { LabelClass, SpanLabel } from "@/lib/traces/types";
import { swrFetcher } from "@/lib/utils";

type LabelsContextType = {
  mutate: KeyedMutator<SpanLabel[]>;
  mutateLabelClass: KeyedMutator<LabelClass[]>;
  labels: SpanLabel[];
  labelClasses: LabelClass[];
  isLoading: boolean;
};

const LabelsContext = createContext<LabelsContextType>({
  mutate: () => Promise.resolve(undefined),
  mutateLabelClass: () => Promise.resolve(undefined),
  labels: [],
  labelClasses: [],
  isLoading: false,
});

export const useLabelsContext = () => useContext(LabelsContext);

const LabelsContextProvider = ({ children }: PropsWithChildren) => {
  const params = useParams();
  const searchParams = useSearchParams();
  const spanId = searchParams.get("spanId");
  const {
    data: labelClasses = [],
    mutate: mutateLabelClass,
    isLoading: isLabelsLoading,
  } = useSWR<LabelClass[]>(`/api/projects/${params?.projectId}/label-classes`, swrFetcher);
  const {
    data = [],
    isLoading,
    mutate,
  } = useSWR<SpanLabel[]>(spanId ? `/api/projects/${params?.projectId}/spans/${spanId}/labels` : null, swrFetcher);

  const value = useMemo<LabelsContextType>(
    () => ({
      isLoading: isLoading || isLabelsLoading,
      mutate,
      mutateLabelClass,
      labels: data,
      labelClasses,
    }),
    [data, isLabelsLoading, isLoading, labelClasses, mutate, mutateLabelClass]
  );
  return <LabelsContext.Provider value={value}>{children}</LabelsContext.Provider>;
};

export default LabelsContextProvider;
