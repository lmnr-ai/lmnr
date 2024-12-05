import { formatDate } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { DateRange as ReactDateRange } from 'react-day-picker';

import { cn } from '@/lib/utils';

import { Button } from './button';
import { Calendar } from './calendar';
import { Input } from './input';
import { Label } from './label';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

type DateRange = {
  name: string;
  value: string;
};

const RANGES: DateRange[] = [
  {
    name: '1h',
    value: '1'
  },
  {
    name: '24h',
    value: '24'
  },
  {
    name: '7d',
    value: (24 * 7).toString()
  },
  {
    name: '30d',
    value: (24 * 30).toString()
  },
  {
    name: 'All',
    value: 'all'
  }
];

function AbsoluteDateRangeFilter() {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const pastHours = searchParams.get('pastHours');
  const [calendarDate, setCalendarDate] = useState<ReactDateRange | undefined>(
    undefined
  );
  useEffect(() => {
    let urlFrom: Date | undefined = undefined;
    try {
      const param = searchParams.get('startDate');
      if (param != undefined) {
        urlFrom = new Date(searchParams.get('startDate') as string);
      }
    } catch (e) {}

    let urlTo: Date | undefined = undefined;
    try {
      const param = searchParams.get('endDate');
      if (param != undefined) {
        urlTo = new Date(searchParams.get('endDate') as string);
      }
    } catch (e) {}

    if (
      calendarDate === undefined ||
      urlFrom === undefined ||
      urlTo === undefined
    ) {
      setCalendarDate({
        from: urlFrom,
        to: urlTo
      });
    }
  }, [pastHours]);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  return (
    <div className={cn('grid gap-2')}>
      <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant="ghost"
            className={cn(
              'justify-start text-left flex font-normal',
              !calendarDate && 'text-muted-foreground'
            )}
          >
            <div>
              {calendarDate?.from ? (
                calendarDate.to ? (
                  <>
                    {formatDate(calendarDate.from, 'LLL dd, y HH:mm')} -{' '}
                    {formatDate(calendarDate.to, 'LLL dd, y HH:mm')}
                  </>
                ) : (
                  formatDate(calendarDate?.from, 'LLL dd, y HH:mm')
                )
              ) : (
                <div className="flex space-x-2 text-foreground">
                  <CalendarIcon size={14} /> <div>Custom </div>{' '}
                </div>
              )}
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={calendarDate?.from}
            selected={calendarDate}
            onSelect={setCalendarDate}
            numberOfMonths={2}
          />
          <div className="flex p-2 space-x-1">
            <div className="flex p-1 flex-grow">
              <Label className="py-2 flex-grow">
                {calendarDate?.from
                  ? formatDate(calendarDate.from, 'LLL dd, y')
                  : 'Select start date'}
              </Label>
              <Input
                type="time"
                disabled={calendarDate?.from === undefined}
                className="flex-shrink max-w-24"
                value={`${calendarDate?.from?.getHours().toString().padStart(2, '0') ?? '00'}:${calendarDate?.from?.getMinutes().toString().padStart(2, '0') ?? '00'}`}
                onChange={(e) => {
                  const from = calendarDate?.from;
                  if (from) {
                    const time = e.target.value;
                    const [hours, minutes] = time.split(':');
                    from.setHours(parseInt(hours));
                    from.setMinutes(parseInt(minutes));
                    setCalendarDate({
                      from,
                      to: calendarDate.to
                    });
                  }
                }}
              />
            </div>
            <div className="flex p-1 flex-grow">
              <Label className="py-2 flex-grow">
                {calendarDate?.to
                  ? formatDate(calendarDate.to, 'LLL dd, y')
                  : 'Select end date'}
              </Label>
              <Input
                type="time"
                disabled={calendarDate?.to === undefined}
                className="flex-shrink max-w-24"
                value={`${calendarDate?.to?.getHours().toString().padStart(2, '0') ?? '00'}:${calendarDate?.to?.getMinutes().toString().padStart(2, '0') ?? '00'}`}
                onChange={(e) => {
                  const to = calendarDate?.to;
                  if (to) {
                    const time = e.target.value;
                    const [hours, minutes] = time.split(':');
                    to.setHours(parseInt(hours));
                    to.setMinutes(parseInt(minutes));
                    setCalendarDate({
                      from: calendarDate.from,
                      to
                    });
                  }
                }}
              />
            </div>
          </div>
          <div className="flex justify-end p-2">
            <Button
              disabled={
                calendarDate?.from === undefined ||
                calendarDate?.to === undefined
              }
              onClick={() => {
                searchParams.delete('pastHours');
                searchParams.set('pageNumber','0');
                searchParams.set(
                  'startDate',
                  calendarDate?.from?.toISOString() ?? ''
                );
                searchParams.set(
                  'endDate',
                  calendarDate?.to?.toISOString() ?? ''
                );
                setIsPopoverOpen(false);
                router.push(`${pathName}?${searchParams.toString()}`);
              }}
              handleEnter
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default function DateRangeFilter() {
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const pathName = usePathname();
  const router = useRouter();
  const pastHours = searchParams.get('pastHours');
  let selectedRange: DateRange | undefined = undefined;
  if (pastHours !== null) {
    selectedRange =
      RANGES.find((range) => range.value === pastHours) ?? RANGES[1];
  }

  return (
    <div className="flex items-start flex-none space-x-4">
      <div className="flex rounded-md border h-8">
        {
          <>
            {RANGES.map((range, index) => (
              <div
                key={index}
                className={cn(
                  'h-full items-center flex px-2 cursor-pointer border-r',
                  range.value === selectedRange?.value
                    ? 'bg-secondary/80'
                    : 'hover:bg-secondary/80'
                )}
                onClick={() => {
                  searchParams.delete('startDate');
                  searchParams.delete('endDate');
                  searchParams.delete('groupByInterval');
                  searchParams.set('pastHours', range.value);
                  searchParams.set('pageNumber', '0');
                  router.push(`${pathName}?${searchParams.toString()}`);
                }}
              >
                {range.name}
              </div>
            ))}
            <AbsoluteDateRangeFilter />
          </>
        }
      </div>
    </div>
  );
}
