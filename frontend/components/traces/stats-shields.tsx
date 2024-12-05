import { TooltipPortal } from '@radix-ui/react-tooltip';
import { CircleDollarSign, Clock3, Coins, InfoIcon } from 'lucide-react';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { getDurationString } from '@/lib/flow/utils';
import { cn } from '@/lib/utils';

import { Label } from '../ui/label';

interface StatsShieldsProps {
  startTime: string;
  endTime: string;
  totalTokenCount: number;
  inputTokenCount: number;
  outputTokenCount: number;
  inputCost: number | null;
  outputCost: number | null;
  cost: number | null;
  className?: string;
}

export default function StatsShields({
  startTime,
  endTime,
  totalTokenCount,
  inputTokenCount,
  outputTokenCount,
  inputCost,
  outputCost,
  cost,
  className
}: StatsShieldsProps) {
  return (
    <div className={cn('flex items-center space-x-2 font-mono', className)}>
      <div className="flex space-x-1 items-center p-0.5 px-2 border rounded-md">
        <Clock3 size={12} />
        <Label className="text-sm">
          {getDurationString(startTime, endTime)}
        </Label>
      </div>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex space-x-1 items-center p-0.5 px-2 border rounded-md">
              <Coins size={12} />
              <Label className="text-sm">{totalTokenCount}</Label>
              <InfoIcon size={12} />
            </div>
          </TooltipTrigger>
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-2">
                <Label className="flex"> Input tokens {inputTokenCount}</Label>
                <Label className="flex">
                  {' '}
                  Output tokens {outputTokenCount}
                </Label>
              </div>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
      <TooltipProvider delayDuration={250}>
        <Tooltip>
          <TooltipTrigger>
            <div className="flex space-x-1 items-center p-0.5 px-2 border rounded-md">
              <CircleDollarSign size={12} />
              <Label className="text-sm">${cost?.toFixed(5)}</Label>
              <InfoIcon size={12} />
            </div>
          </TooltipTrigger>
          {/* portal here so that SpanView does not overlay */}
          <TooltipPortal>
            <TooltipContent side="bottom" className="p-2 border">
              <div className="flex-col space-y-2">
                <Label className="flex">
                  {' '}
                  Input cost {'$' + inputCost?.toFixed(5)}
                </Label>
                <Label className="flex">
                  {' '}
                  Output cost {'$' + outputCost?.toFixed(5)}
                </Label>
              </div>
            </TooltipContent>
          </TooltipPortal>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
}
