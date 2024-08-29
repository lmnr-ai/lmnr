import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type DateRange = {
  name: string;
  value: number | null;
}

const RANGES: DateRange[] = [
  {
    name: "1h",
    value: 1
  },
  {
    name: "24h",
    value: 24
  },
  {
    name: "7d",
    value: 24 * 7
  },
  {
    name: "30d",
    value: 24 * 30
  },
  {
    name: "All",
    value: null
  },
]

interface DateRangeFilterProps {
}

export default function DateRangeFilter({ }: DateRangeFilterProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();

  const pastHours = searchParams.get('pastHours');
  let defaultSelectedRange: DateRange;
  if (pastHours !== null) {
    // TODO: Allow the user to pass any amount of pastHours, not just from the ranges
    defaultSelectedRange = RANGES.find((range) => range.value === parseInt(pastHours)) ?? RANGES[1];
  } else {
    defaultSelectedRange = RANGES[1]; // default to 24h
  }
  const [selectedRange, setSelectedRange] = useState(defaultSelectedRange);

  return (
    <div className="flex items-start flex-none space-x-4">
      <div className="flex rounded border h-[32px]">
        {
          RANGES.map((range, index) => (
            <div
              key={index}
              className={cn("h-full items-center flex px-2 cursor-pointer", range.value === selectedRange.value ? "bg-secondary/80" : "hover:bg-secondary/80")}
              onClick={() => {
                if (range.value === null) {
                  searchParams.delete('pastHours');
                } else {
                  searchParams.set('pastHours', range.value.toString());
                }
                router.push(`${pathName}?${searchParams.toString()}`);

                setSelectedRange(range);
              }}
            >
              {range.name}
            </div>
          ))
        }
      </div>
    </div>
  )
}
