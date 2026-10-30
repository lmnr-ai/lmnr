import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

import { isValidZoomRange, normalizeTimeRange } from "@/lib/charts/time";

/** URL navigation is a caller concern; the plot reports x-domain endpoints. */
export const useChartUrlZoom = () => {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = useSearchParams();

  return useCallback(
    (startDate: string, endDate: string) => {
      if (!isValidZoomRange(startDate, endDate)) return;
      const { start, end } = normalizeTimeRange(startDate, endDate);
      const params = new URLSearchParams(searchParams.toString());
      params.delete("pastHours");
      params.set("startDate", start);
      params.set("endDate", end);
      router.push(`${pathName}?${params.toString()}`);
    },
    [pathName, router, searchParams]
  );
};
