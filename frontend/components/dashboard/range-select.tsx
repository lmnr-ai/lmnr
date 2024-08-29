import { cn } from "@/lib/utils";
import { Select, SelectValue, SelectContent, SelectItem, SelectTrigger } from "../ui/select";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

const RANGES = [
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
]

interface RangeSelectProps {
  setPastHours: (hours: number) => void
  setGroupByInterval: (interval: string) => void
}

export default function RangeSelect({ setPastHours, setGroupByInterval }: RangeSelectProps) {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();

  const pastHours = searchParams.get('pastHours');
  const defaultSelectedRange = RANGES.find((range) => range.value === parseInt(pastHours ?? '24')) ?? RANGES[0];
  const [selectedRange, setSelectedRange] = useState(defaultSelectedRange);

  const defaultGroupByInterval = searchParams.get('groupByInterval') ?? 'hour';

  // TODO: Looks like pastHours and groupByInterval must be store variables, so that all components can access them
  useEffect(() => {
    setPastHours(parseInt(pastHours ?? '24'));
    setGroupByInterval(defaultGroupByInterval);
  }, [])

  return (
    <div className="flex items-start flex-none space-x-4">
      <div>
        <Select defaultValue={defaultGroupByInterval} onValueChange={(interval: string) => {
          searchParams.set('groupByInterval', interval);
          router.push(`${pathName}?${searchParams.toString()}`);
          setGroupByInterval(interval);
        }}>
          <SelectTrigger className="font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {
              ["minute", "hour", "day"].map((value) => (
                <SelectItem key={value} value={value}>
                  {value}
                </SelectItem>
              ))
            }
          </SelectContent>
        </Select>
      </div>
      <div className="flex rounded border h-[36px]">
        {
          RANGES.map((range, index) => (
            <div
              key={index}
              className={cn("h-full items-center flex px-2 cursor-pointer", range.value === selectedRange.value ? "bg-secondary/80" : "hover:bg-secondary/80")}
              onClick={() => {
                searchParams.set('pastHours', range.value.toString());
                router.push(`${pathName}?${searchParams.toString()}`);

                setSelectedRange(range);
                setPastHours(range.value);
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
