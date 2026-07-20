"use client";

// A "kitchen sink" spread: many components composed into a realistic slice of the app
// (a traces-style dashboard) so you can read the design system at a glance. Built from the
// same primitives the product uses — icons here also follow the icon-library switcher.
// TEMPORARY tooling; delete with the rest of ui-gallery / style-explorer.

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bubble, BubbleContent } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertTriangle,
  ArrowUpRight,
  ChartNoAxesGantt,
  Check,
  Columns2,
  Database,
  ListFilter,
  RefreshCw,
  Search,
  Sparkles,
} from "@/components/ui/icon-lib";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { DialogSample, DropdownMenuSample, PopoverSample, SheetSample, TooltipSample } from "./samples";

// ---- section shell -----------------------------------------------------------
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">{title}</h3>
      {children}
    </section>
  );
}

// ---- traces-style chart (real ChartContainer pattern, static data) -----------
const chartConfig: ChartConfig = {
  success: { label: "success", color: "hsl(var(--success-bright))" },
  error: { label: "error", color: "hsl(var(--destructive-bright))" },
};
const chartData = [
  { t: "03 PM", success: 1, error: 0 },
  { t: "04 PM", success: 2, error: 0 },
  { t: "05 PM", success: 3, error: 1 },
  { t: "06 PM", success: 1, error: 0 },
  { t: "09 PM", success: 2, error: 0 },
  { t: "10 PM", success: 2, error: 1 },
  { t: "12 AM", success: 1, error: 0 },
  { t: "03 AM", success: 1, error: 0 },
  { t: "06 AM", success: 1, error: 0 },
  { t: "09 AM", success: 2, error: 0 },
  { t: "11 AM", success: 4, error: 1 },
  { t: "12 PM", success: 1, error: 0 },
];

// ---- stat cards --------------------------------------------------------------
const STATS = [
  { label: "Total traces", value: "1,284", delta: "+12%" },
  { label: "Tokens", value: "3.9M", delta: "+8%" },
  { label: "Cost", value: "$42.10", delta: "+3%" },
  { label: "Error rate", value: "1.8%", delta: "-0.4%" },
];

// ---- table rows --------------------------------------------------------------
type Status = "success" | "error";
const ROWS: { id: string; span: string; tokens: string; cost: string; when: string; status: Status }[] = [
  { id: "6f7acc92-6a93", span: "chat_completion", tokens: "1,204", cost: "$0.014", when: "12m ago", status: "success" },
  { id: "660a47fb-36b3", span: "agent_loop", tokens: "8,932", cost: "$0.098", when: "1h ago", status: "success" },
  { id: "a5928ddc-30d7", span: "tool_call", tokens: "312", cost: "$0.003", when: "1h ago", status: "error" },
  { id: "e55b3e61-5606", span: "chat_completion", tokens: "2,041", cost: "$0.022", when: "2h ago", status: "success" },
  { id: "0a66d148-a7a3", span: "retrieval", tokens: "744", cost: "$0.007", when: "3h ago", status: "success" },
];

export default function Assorted() {
  return (
    <div className="flex flex-col gap-8 pb-16">
      {/* toolbar */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <Database className="size-4 text-muted-foreground" />
          <h2 className="text-lg font-semibold">traces</h2>
        </div>
        <Tabs defaultValue="traces">
          <TabsList>
            <TabsTrigger value="traces">Traces</TabsTrigger>
            <TabsTrigger value="spans">Spans</TabsTrigger>
            <TabsTrigger value="sessions">Sessions</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm">
            <ListFilter className="mr-1 size-3.5" /> Add filter
          </Button>
          <Button variant="outline" size="sm">
            <Columns2 className="mr-1 size-3.5" /> Columns
          </Button>
          <Button variant="outline" size="sm">
            <RefreshCw className="mr-1 size-3.5" /> Refresh
          </Button>
          <div className="flex items-center gap-2 pl-1">
            <Switch id="assorted-realtime" />
            <Label htmlFor="assorted-realtime" className="text-muted-foreground">
              Realtime
            </Label>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Search…" className="h-8 w-56 pl-7" />
            </div>
            <Button variant="outlinePrimary" size="sm">
              <Sparkles className="mr-1 size-3.5" /> Ask AI
            </Button>
          </div>
        </div>
      </div>

      {/* stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {STATS.map((s) => (
          <Card key={s.label}>
            <CardHeader className="pb-2">
              <CardDescription>{s.label}</CardDescription>
              <CardTitle className="text-2xl">{s.value}</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <ArrowUpRight className="size-3" />
                {s.delta}
              </span>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* chart */}
      <Section title="Chart">
        <Card>
          <CardContent className="pt-6">
            <ChartContainer config={chartConfig} className="h-48 w-full">
              <BarChart data={chartData} margin={{ left: -8, top: 8 }} barCategoryGap={2}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey="t" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Bar dataKey="success" stackId="s" fill="var(--color-success)" radius={[0, 0, 2, 2]} />
                <Bar dataKey="error" stackId="s" fill="var(--color-error)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ChartContainer>
          </CardContent>
        </Card>
      </Section>

      {/* table */}
      <Section title="Table">
        <div className="rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Root span</TableHead>
                <TableHead className="text-right">Tokens</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-mono text-xs">{r.id}…</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center gap-1.5">
                      <ChartNoAxesGantt className="size-3.5 text-muted-foreground" />
                      {r.span}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{r.tokens}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.cost}</TableCell>
                  <TableCell className="text-muted-foreground">{r.when}</TableCell>
                  <TableCell>
                    {r.status === "success" ? (
                      <Badge variant="secondary" className="gap-1">
                        <Check className="size-3 text-success" /> success
                      </Badge>
                    ) : (
                      <Badge variant="destructive" className="gap-1">
                        <AlertTriangle className="size-3" /> error
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Section>

      {/* buttons + badges */}
      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Default</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline">Outline</Button>
          <Button variant="outlinePrimary">Primary outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="destructive">Destructive</Button>
          <Button variant="destructiveOutline">Delete</Button>
          <Button variant="link">Link</Button>
        </div>
      </Section>
      <Section title="Badges">
        <div className="flex flex-wrap gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="outlinePrimary">Primary</Badge>
          <Badge variant="destructive">Destructive</Badge>
        </div>
      </Section>

      {/* form card */}
      <Section title="Form">
        <Card>
          <CardHeader>
            <CardTitle>Project settings</CardTitle>
            <CardDescription>A representative form built from the same inputs the app uses.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <Label htmlFor="assorted-name">Name</Label>
              <Input id="assorted-name" defaultValue="production" className="max-w-sm" />
            </div>
            <div className="flex flex-col gap-2">
              <Label>Environment</Label>
              <Select defaultValue="prod">
                <SelectTrigger className="max-w-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">Production</SelectItem>
                  <SelectItem value="staging">Staging</SelectItem>
                  <SelectItem value="dev">Development</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Sampling rate</Label>
              <div className="flex items-center gap-3">
                <input type="range" min={0} max={100} defaultValue={40} className="flex-1 max-w-sm" />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label>Retention</Label>
              <RadioGroup defaultValue="30" className="flex gap-4">
                {["7", "30", "90"].map((d) => (
                  <div key={d} className="flex items-center gap-2">
                    <RadioGroupItem value={d} id={`assorted-ret-${d}`} />
                    <Label htmlFor={`assorted-ret-${d}`}>{d} days</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="assorted-pii" defaultChecked />
              <Label htmlFor="assorted-pii">Redact PII before storage</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="assorted-alerts" defaultChecked />
              <Label htmlFor="assorted-alerts">Enable alerts</Label>
            </div>
            <Separator />
            <div className="flex justify-end gap-2">
              <Button variant="ghost">Cancel</Button>
              <Button>Save changes</Button>
            </div>
          </CardContent>
        </Card>
      </Section>

      {/* feedback */}
      <Section title="Feedback">
        <div className="flex flex-col gap-3">
          <Alert>
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>Your traces are being ingested in real time.</AlertDescription>
          </Alert>
          <Alert variant="warning">
            <AlertTitle>Approaching your plan limit</AlertTitle>
            <AlertDescription>You have used 82% of your included signal budget this cycle.</AlertDescription>
          </Alert>
          <Alert variant="destructive">
            <AlertTitle>Ingestion blocked</AlertTitle>
            <AlertDescription>Hard limit reached — data ingestion is paused until the cycle resets.</AlertDescription>
          </Alert>
          <div className="flex flex-col gap-2">
            <Progress value={40} />
            <Progress value={82} />
          </div>
        </div>
      </Section>

      {/* people + chat */}
      <Section title="Avatars & chat">
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarFallback>KY</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>AL</AvatarFallback>
          </Avatar>
          <Avatar>
            <AvatarFallback>GR</AvatarFallback>
          </Avatar>
        </div>
        <div className="flex flex-col gap-2">
          <Bubble variant="secondary">
            <BubbleContent>What was the p95 latency for the agent loop yesterday?</BubbleContent>
          </Bubble>
          <Bubble variant="default">
            <BubbleContent>The p95 latency for the agent loop was 2.4s across 1,284 traces.</BubbleContent>
          </Bubble>
        </div>
      </Section>

      {/* overlays */}
      <Section title="Overlays">
        <div className="flex flex-wrap gap-2">
          {DialogSample}
          {PopoverSample}
          {DropdownMenuSample}
          {SheetSample}
          {TooltipSample}
        </div>
      </Section>
    </div>
  );
}
