import { times } from "lodash";
import React from "react";

import { Skeleton } from "@/components/ui/skeleton.tsx";

const Loading = () => (
  <div className="flex flex-col flex-1">
    <div className="flex items-center gap-x-2 p-2 border-b h-12">
      <Skeleton className="h-8 w-full" />
    </div>
    <div className="flex flex-col p-2 gap-2">
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  </div>
);

export const SpansLoading = () => (
  <div className="flex flex-col flex-1 overflow-hidden">
    <div className="flex items-center gap-2 pb-2 pt-0 pl-2 pr-[96px] border-b">
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-20 rounded" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
        <Skeleton className="h-6 w-16 rounded" />
      </div>
    </div>
    <div className="flex flex-col gap-2 p-2">
      {times(5, (i) => (
        <Skeleton key={i} className="h-7 w-full rounded" />
      ))}
    </div>
  </div>
);

export default Loading;
