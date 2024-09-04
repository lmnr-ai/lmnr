import { cn } from "@/lib/utils";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

type DateRange = {
  name: string;
  value: string;
}

const RANGES: DateRange[] = [
  {
    name: "1h",
    value: "1"
  },
  {
    name: "24h",
    value: "24"
  },
  {
    name: "7d",
    value: (24 * 7).toString()
  },
  {
    name: "30d",
    value: (24 * 30).toString()
  },
  {
    name: "All",
    value: "all"
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
    defaultSelectedRange = RANGES.find((range) => range.value === pastHours) ?? RANGES[1];
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

                searchParams.set('pastHours', range.value);
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
