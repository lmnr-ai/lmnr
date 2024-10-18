import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from '@/components/ui/chart';
import { useProjectContext } from '@/contexts/project-context';
import { cn, swrFetcher } from '@/lib/utils';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import useSWR from 'swr';
import { Skeleton } from '../ui/skeleton';
import React, { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const URL_QUERY_PARAMS = {
  COMPARE_EVAL_ID: 'comparedEvaluationId'
};

const getEvaluationIdFromPathname = (pathName: string) => {
  if (pathName.endsWith('/')) {
    pathName = pathName.slice(0, -1);
  }
  const pathParts = pathName.split('/');
  return pathParts[pathParts.length - 1];
};

type BucketRow = {
  lowerBound: number;
  upperBound: number;
  heights: number[];
};

const getTransformedData = (data: []) =>
  data.map((row: BucketRow, index: number) => ({
    index,
    height: row.heights[0],
    comparedHeight: row.heights.length > 1 ? row.heights[1] : undefined
  }));

function renderTick(tickProps: any) {
  const { x, y, payload } = tickProps;
  const { value, offset } = payload;
  // console.log(`x: ${x}, y: ${y}`)
  // console.log(`Value: ${value}, ${typeof value}, offset: ${offset}`)

  // Value is equal to index starting from 0
  // So we calculate percentage ticks/marks by multiplying value by 10
  return (
    <g>
      <path d={`M${x - offset},${y - 8}v${+4}`} stroke="gray" />
      <text
        x={x - offset + 4}
        y={y + 8}
        textAnchor="middle"
        fill="gray"
        fontSize="8"
      >
        {value * 10}%
      </text>
      {value === 9 && (
        <>
          <path d={`M${x + offset},${y - 8}v${+4}`} stroke="gray" />
          <text
            x={x + offset - 10}
            y={y + 8}
            textAnchor="middle"
            fill="gray"
            fontSize="8"
          >
            100%
          </text>
        </>
      )}
    </g>
  );
}

interface ChartProps {
  scoreName: string;
  className?: string;
}

export default function Chart({ scoreName, className }: ChartProps) {
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const { projectId } = useProjectContext();

  const [evaluationId, setEvaluationId] = useState(
    getEvaluationIdFromPathname(pathName)
  );
  const [comparedEvaluationId, setComparedEvaluationId] = useState(
    searchParams.get(URL_QUERY_PARAMS.COMPARE_EVAL_ID)
  );

  const { data, isLoading, error } = useSWR(
    `/api/projects/${projectId}/evaluation-score-distribution?evaluationIds=${evaluationId + (comparedEvaluationId ? `,${comparedEvaluationId}` : '')}&scoreName=${scoreName}`,
    swrFetcher
  );

  useEffect(() => {
    setEvaluationId(getEvaluationIdFromPathname(pathName));
  }, [pathName]);

  useEffect(() => {
    setComparedEvaluationId(searchParams.get(URL_QUERY_PARAMS.COMPARE_EVAL_ID));
  }, [searchParams]);

  const chartConfig = {
    ['index']: {
      color: 'hsl(var(--chart-1))'
    }
  } satisfies ChartConfig;

  return (
    <div className={cn('', className)}>
      {/* <div className="text-sm font-medium text-secondary-foreground">
        Score distribution: {scoreName}
      </div> */}
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
              {comparedEvaluationId && (
                <Bar
                  dataKey="comparedHeight"
                  fill="hsl(var(--chart-2))"
                  radius={4}
                  name="Compared"
                />
              )}
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
