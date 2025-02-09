import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { BucketRow } from "@/lib/types";

import { Label } from "../ui/label";

const getTransformedData = (data: {
  [scoreName: string]: BucketRow[];
}): { index: number; [scoreName: string]: number }[] => {
  const res: { [index: number]: { [scoreName: string]: number } } = {};
  for (const [scoreName, rows] of Object.entries(data)) {
    rows.forEach((row, index) => {
      res[index] = {
        ...res[index],
        [scoreName]: row.heights[0],
      };
    });
  }
  return Object.values(res).map((row, index) => ({
    index,
    ...row,
  }));
};

function renderTick(tickProps: any) {
  const {
    x,
    y,
    payload: { value, offset },
  } = tickProps;
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

interface ChartProps {
  evaluationId: string;
  scores: string[];
  className?: string;
  isLoading?: boolean;
}

export default function Chart({ evaluationId, scores, className, isLoading = false }: ChartProps) {
  const params = useParams();
  const [data, setData] = useState<{ [score: string]: BucketRow[] }>({});
  const [showScores, setShowScores] = useState<string[]>(scores);
  const [isScoresLoading, setIsScoresLoading] = useState(false);

  useEffect(() => {
    try {
      setIsScoresLoading(true);
      scores.forEach((scoreName) => {
        fetch(
          `/api/projects/${params?.projectId}/evaluation-score-distribution?` +
            `evaluationIds=${evaluationId}&scoreName=${scoreName}`
        )
          .then((res) => res.json())
          .then((data) => setData((prev) => ({ ...prev, [scoreName]: data })));
      });
      setIsScoresLoading(false);
    } catch (e) {}
  }, [evaluationId, scores, params?.projectId]);

  const chartConfig = useMemo<ChartConfig>(
    () =>
      Object.fromEntries(
        scores.map((scoreName, index) => [
          scoreName,
          {
            color: `hsl(var(--chart-${(index % 5) + 1}))`,
            label: scoreName,
          },
        ])
      ),
    [scores]
  );

  return (
    <div className={className}>
      {isScoresLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <ChartContainer config={chartConfig} className="max-h-[178px] w-full">
            <BarChart accessibilityLayer data={getTransformedData(data)} barSize={"4%"}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="index"
                tickLine={false}
                axisLine={true}
                padding={{ left: 0, right: 0 }}
                tick={renderTick as any}
              />
              <YAxis tickLine={false} axisLine={false} tickMargin={8} tickCount={3} />
              <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
              {showScores.map((scoreName) => (
                <Bar
                  key={scoreName}
                  dataKey={scoreName}
                  fill={chartConfig[scoreName].color}
                  radius={4}
                  name={scoreName}
                />
              ))}
            </BarChart>
          </ChartContainer>
          <div className="flex flex-row justify-center w-full space-x-4 items-center">
            {scores.map((score) => (
              <div
                key={score}
                className={"flex items-center text-sm cursor-pointer " + "decoration-dashed text-muted-foreground"}
                style={
                  showScores.includes(score)
                    ? {
                      color: chartConfig[score].color,
                    }
                    : {}
                }
                onClick={() => {
                  let newShowScores = new Set(showScores);
                  if (newShowScores.has(score)) {
                    newShowScores.delete(score);
                  } else {
                    newShowScores.add(score);
                  }
                  setShowScores(Array.from(newShowScores));
                }}
              >
                <Label className="cursor-pointer">{score}</Label>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
