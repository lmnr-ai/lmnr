'use client';

import { EvaluationDatapointPreview, EvaluationDatapointPreviewWithCompared, EvaluationResultsInfo, EvaluationWithPipelineInfo } from "@/lib/evaluation/types";
import { ColumnDef } from "@tanstack/react-table";
import { useEffect, useMemo, useState } from "react";
import { DataTable } from "../ui/datatable";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "../ui/resizable";
import { useUserContext } from "@/contexts/user-context";
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/const";
import EvaluationPanel from "../evaluation/evaluation-panel";
import EvaluationStats from "../evaluation/evaluation-stats";
import { mutate } from "swr";
import { useProjectContext } from "@/contexts/project-context";
import Header from "../ui/header";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { mergeOriginalWithComparedDatapoints } from "@/lib/evaluation/utils";
import { ArrowRight } from "lucide-react";
import { Button } from "../ui/button";
import { cn, formatTimestampFromSeconds } from "@/lib/utils";
import { Event, EventTemplate } from "@/lib/events/types";
import { Label } from "../ui/label";

import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts"
import EditEventTemplateDialog from "./edit-event-template-dialog";
import DeleteEventTemplateDialog from "./delete-event-template-dialog";

interface EventProps {
  eventTemplate: EventTemplate;
  events: Event[];
  metrics: { [key: string]: { [key: string]: number }[] };
}

export default function EventTemplateComponent({
  eventTemplate,
  events,
  metrics,
}: EventProps) {
  const router = useRouter();
  const pathName = usePathname();
  const searchParams = new URLSearchParams(useSearchParams().toString());
  const { projectId } = useProjectContext();

  const columns: ColumnDef<Event>[] = [
    {
      accessorKey: "id",
      header: "ID",
    },
    {
      accessorKey: "createdAt",
      header: "Created At",
    },
    {
      accessorKey: "spanId",
      header: "Span ID",
    },
    {
      accessorKey: "value",
      header: "Value",
    },
  ];

  return (
    <div className="h-full w-full flex flex-col">
      <Header path={`event templates/${eventTemplate.name}`} />
      <div className="flex flex-col h-full">
        <div className="flex-none flex w-full">
          <div className="min-w-96 w-96 flex-none p-4 flex flex-col space-y-4 items-start">
            <p className="text-2xl font-bold">{eventTemplate.name}</p>
            <div className="flex space-x-2 w-full">
              <div className="flex flex-grow">
                <Label className="p-2 border rounded">{eventTemplate.eventType}</Label>
              </div>
              <div className="flex flex-shrink space-x-2">
                <EditEventTemplateDialog defaultEventTemplate={eventTemplate} />
                <DeleteEventTemplateDialog defaultEventTemplate={eventTemplate} />
              </div>
            </div>
            <p>{eventTemplate.description}</p>
            <Label className="text-sm text-secondary-foreground">{eventTemplate.instruction}</Label>
          </div>
          <div className="flex-grow p-4">
            <CustomChart
              data={metrics['count']}
              title="Total Count"
              xAxisKey="time"
              yAxisKey="value"
            />
          </div>
        </div>
        <div className="flex-grow flex flex-col">
          <DataTable
            columns={columns}
            data={events}
            enableRowSelection
            filterColumns={columns}
            enableDateRangeFilter
          />
        </div>
      </div>
    </div>
  );
}

interface CustomChartProps {
  data: any
  title: string
  xAxisKey: string
  yAxisKey: string
  className?: string
}

export function CustomChart({ data, title, xAxisKey, yAxisKey, className }: CustomChartProps) {

  const chartConfig = {
    [xAxisKey]: {
      color: "hsl(var(--chart-2))",
    },
  } satisfies ChartConfig

  return (
    <div className="">
      <div className="text-sm font-medium text-secondary-foreground">
        {title}
      </div>
      <div className="">
        <ChartContainer config={chartConfig} className="max-h-48 w-full">
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              type="number"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              tickFormatter={formatTimestampFromSeconds}
              axisLine={false}
              tickMargin={10}
              dataKey={xAxisKey}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickCount={4}
              tickMargin={20}
            />
            <ChartTooltip
              cursor={false}
              content={<ChartTooltipContent
                labelKey={xAxisKey}
                labelFormatter={(label, p) => formatTimestampFromSeconds(p[0].payload[xAxisKey])}
              />}
            />
            <Bar
              dataKey={yAxisKey}
              type="monotone"
              fill="hsl(var(--chart-1))"
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  )
}