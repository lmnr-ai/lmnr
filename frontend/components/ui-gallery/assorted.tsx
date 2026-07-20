"use client";

// A shadcn-"sink"-style masonry grid: each card holds one component demo so the whole
// design system reads at a glance. Built from the real ui primitives + the app's
// ChartContainer pattern; icons follow the icon-library switcher.
// TEMPORARY tooling; delete with the rest of ui-gallery / style-explorer.

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { AlertTriangle, Check, Plus, Search, Sparkles } from "@/components/ui/icon-lib";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import * as S from "./samples";

// One card in the masonry grid. `break-inside-avoid` keeps a card from splitting across columns.
function Cell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4 break-inside-avoid rounded-lg border border-border bg-card p-4">
      <div className="mb-3 text-xs font-medium uppercase tracking-wide text-muted-foreground/70">{title}</div>
      {children}
    </div>
  );
}

const chartConfig: ChartConfig = {
  success: { label: "success", color: "hsl(var(--success-bright))" },
  error: { label: "error", color: "hsl(var(--destructive-bright))" },
};
const chartData = [
  { t: "Mon", success: 3, error: 0 },
  { t: "Tue", success: 5, error: 1 },
  { t: "Wed", success: 2, error: 0 },
  { t: "Thu", success: 6, error: 2 },
  { t: "Fri", success: 4, error: 0 },
  { t: "Sat", success: 1, error: 0 },
  { t: "Sun", success: 3, error: 1 },
];

const ROWS = [
  { id: "6f7acc92", tokens: "1,204", ok: true },
  { id: "660a47fb", tokens: "8,932", ok: true },
  { id: "a5928ddc", tokens: "312", ok: false },
  { id: "e55b3e61", tokens: "2,041", ok: true },
];

export default function Assorted() {
  return (
    <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
      <Cell title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button size="sm">Default</Button>
          <Button size="sm" variant="secondary">
            Secondary
          </Button>
          <Button size="sm" variant="outline">
            Outline
          </Button>
          <Button size="sm" variant="outlinePrimary">
            <Sparkles className="mr-1 size-3.5" /> Ask AI
          </Button>
          <Button size="sm" variant="ghost">
            Ghost
          </Button>
          <Button size="sm" variant="destructive">
            Delete
          </Button>
          <Button size="sm" variant="link">
            Link
          </Button>
          <Button size="icon" variant="outline">
            <Plus className="size-4" />
          </Button>
        </div>
      </Cell>

      <Cell title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="outlinePrimary">Primary</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="secondary" className="gap-1">
            <Check className="size-3 text-success" /> success
          </Badge>
        </div>
      </Cell>

      <Cell title="Chart">
        <ChartContainer config={chartConfig} className="h-40 w-full">
          <BarChart data={chartData} margin={{ left: -16, top: 4 }} barCategoryGap={4}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="t" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={24} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="success" stackId="s" fill="var(--color-success)" radius={[0, 0, 2, 2]} />
            <Bar dataKey="error" stackId="s" fill="var(--color-error)" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ChartContainer>
      </Cell>

      <Cell title="Table">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead className="text-right">Tokens</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ROWS.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-mono text-xs">{r.id}…</TableCell>
                <TableCell className="text-right tabular-nums">{r.tokens}</TableCell>
                <TableCell>
                  {r.ok ? (
                    <Badge variant="secondary" className="gap-1">
                      <Check className="size-3 text-success" /> ok
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="gap-1">
                      <AlertTriangle className="size-3" /> err
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Cell>

      <Cell title="Search">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search traces…" className="pl-7" />
        </div>
      </Cell>

      <Cell title="Input">{S.InputSample}</Cell>
      <Cell title="Select">{S.SelectSample}</Cell>
      <Cell title="Combobox">{S.ComboboxSample}</Cell>
      <Cell title="Switch">{S.SwitchSample}</Cell>
      <Cell title="Checkbox">{S.CheckboxSample}</Cell>
      <Cell title="Radio group">{S.RadioGroupSample}</Cell>
      <Cell title="Slider">{S.SliderSample}</Cell>
      <Cell title="Progress">{S.ProgressSample}</Cell>
      <Cell title="Tabs">{S.TabsSample}</Cell>
      <Cell title="Accordion">{S.AccordionSample}</Cell>

      <Cell title="Alerts">
        <div className="flex flex-col gap-2">
          <Alert>
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Traces are ingesting in real time.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Approaching your limit</AlertTitle>
            <AlertDescription>82% of your signal budget used.</AlertDescription>
          </Alert>
        </div>
      </Cell>

      <Cell title="Avatars">{S.AvatarSample}</Cell>
      <Cell title="Skeleton">{S.SkeletonSample}</Cell>
      <Cell title="Separator">{S.SeparatorSample}</Cell>

      <Cell title="Chat">
        <div className="flex flex-col gap-2">
          <Bubble variant="secondary">
            <BubbleContent>What was the p95 latency yesterday?</BubbleContent>
          </Bubble>
          <Bubble variant="default">
            <BubbleContent>2.4s across 1,284 traces.</BubbleContent>
          </Bubble>
        </div>
      </Cell>

      <Cell title="Command">{S.CommandSample}</Cell>
      <Cell title="Scroll area">{S.ScrollAreaSample}</Cell>
      <Cell title="Tooltip">{S.TooltipSample}</Cell>

      <Cell title="Overlays">
        <div className="flex flex-wrap gap-2">
          {S.DialogSample}
          {S.PopoverSample}
          {S.DropdownMenuSample}
          {S.SheetSample}
        </div>
      </Cell>

      <Cell title="Toast">{S.ToastSample}</Cell>
      <Cell title="Card">{S.CardSample}</Cell>
    </div>
  );
}
