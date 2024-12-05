import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import useSWR from 'swr';

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { useProjectContext } from '@/contexts/project-context';
import { BucketRow } from '@/lib/types';
import { cn, swrFetcher } from '@/lib/utils';

import { Skeleton } from '../ui/skeleton';

const getTransformedData = (data: BucketRow[]) =>
  data.map((row: BucketRow, index: number) => ({
    index,
    height: row.heights[0],
    comparedHeight: row.heights[1],
  }));

function renderTick(tickProps: any) {
  const { x, y, payload: { value, offset } } = tickProps;
  const VERTICAL_TICK_OFFSET = 8;
  const VERTICAL_TICK_LENGTH = 4;
  const FONT_SIZE = 8;
  const BUCKET_COUNT = 10;
  const PERCENTAGE_STEP = 100 / BUCKET_COUNT;

  // Value is equal to index starting from 0
  // So we calculate percentage ticks/marks by multiplying value by 10
  return (
    <g>
      <path d={`M${x - offset},${y - VERTICAL_TICK_OFFSET}v${VERTICAL_TICK_LENGTH}`} stroke="gray" />
      <text
        x={x - offset + FONT_SIZE / 2}
        y={y + VERTICAL_TICK_OFFSET}
        textAnchor="middle"
        fill="gray"
        fontSize={FONT_SIZE}
      >
        {value * PERCENTAGE_STEP}%
      </text>
      {value === BUCKET_COUNT - 1 && (
        <>
          <path d={`M${x + offset},${y - VERTICAL_TICK_OFFSET}v${VERTICAL_TICK_LENGTH}`} stroke="gray" />
          <text
            x={x + offset - FONT_SIZE / 2}
            y={y + VERTICAL_TICK_OFFSET}
            textAnchor="middle"
            fill="gray"
            fontSize={FONT_SIZE}
          >
            100%
          </text>
        </>
      )}
    </g>
  );
}

interface CompareChatProps {
  evaluationId: string;
  comparedEvaluationId: string;
  scoreName: string;
  className?: string;
}

export default function CompareChart({ evaluationId, comparedEvaluationId, scoreName, className }: CompareChatProps) {
  const { projectId } = useProjectContext();

  const { data, isLoading, error } = useSWR(
    `/api/projects/${projectId}/evaluation-score-distribution?` +
    `evaluationIds=${evaluationId},${comparedEvaluationId}&scoreName=${scoreName}`,
    swrFetcher
  );

  const chartConfig = {
    ['index']: {
      color: 'hsl(var(--chart-1))'
    }
  } satisfies ChartConfig;

  return (
    <div className={cn('', className)}>
      <div className="">
        <ChartContainer config={chartConfig} className="max-h-48 w-full">
          {isLoading || !data || error ? (
            <Skeleton className="h-full w-full" />
          ) : (
            <BarChart
              accessibilityLayer
              data={getTransformedData(data)}
              barSize={'4%'}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="index"
                tickLine={false}
                axisLine={true}
                padding={{ left: 0, right: 0 }}
                tick={renderTick as any}
              />
              <ChartTooltip
                cursor={false}
                content={<ChartTooltipContent hideLabel />}
              />
              <Bar
                dataKey="comparedHeight"
                fill="hsl(var(--chart-2))"
                radius={4}
                name="Compared"
              />
              <Bar
                dataKey="height"
                fill="hsl(var(--chart-1))"
                radius={4}
                name="Current"
              />
            </BarChart>
          )}
        </ChartContainer>
      </div>
    </div>
  );
}
