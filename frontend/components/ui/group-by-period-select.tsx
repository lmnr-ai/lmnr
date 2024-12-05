import { useRouter, useSearchParams } from 'next/navigation';

import { getGroupByInterval, isGroupByIntervalAvailable } from '@/lib/utils';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './select';

export function GroupByPeriodSelect() {
  const router = useRouter();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const paramGroupByInterval = searchParams.get('groupByInterval') as
    | string
    | undefined;
  const pastHours = searchParams.get('pastHours') as string | undefined;
  const startDate = searchParams.get('startDate') as string | undefined;
  const endDate = searchParams.get('endDate') as string | undefined;

  const groupByInterval =
    paramGroupByInterval ??
    getGroupByInterval(pastHours, startDate, endDate, undefined);

  return (
    <div className="flex items-center">
      <Select
        value={groupByInterval}
        onValueChange={(value) => {
          searchParams.set('groupByInterval', value);
          router.push(`?${searchParams.toString()}`);
        }}
      >
        <SelectTrigger className="text-sm min-w-4 h-8">
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent className="text-sm">
          {isGroupByIntervalAvailable(
            pastHours,
            startDate,
            endDate,
            'minute'
          ) && (
            <SelectItem key="By minute" value="minute">
              By minute
            </SelectItem>
          )}
          {isGroupByIntervalAvailable(
            pastHours,
            startDate,
            endDate,
            'hour'
          ) && (
            <SelectItem key="By hour" value="hour">
              By hour
            </SelectItem>
          )}
          <SelectItem key="By day" value="day">
            By day
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
