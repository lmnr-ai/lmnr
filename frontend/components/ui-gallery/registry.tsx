import type React from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Bubble } from "@/components/ui/bubble";
import { Button } from "@/components/ui/button";
import { Marker } from "@/components/ui/marker";

import * as S from "./samples";

/**
 * A gallery entry is one of two shapes:
 *  - variant-sweep: give `Component` + `variants` (a prop -> allowed string
 *    values map, copied by hand from the component's cva config since cva
 *    doesn't expose it at runtime). The preview gets per-variant dropdowns and
 *    the grid renders every combination.
 *  - fixed sample: give `sample` (a ready-made composition) for compound,
 *    interactive, or portal-based components that have no variants to sweep.
 * Adding a component = appending one entry.
 */
export interface GalleryEntry {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Component?: React.ComponentType<any>;
  variants?: Record<string, string[]>;
  defaultProps?: Record<string, unknown>;
  sampleChildren?: React.ReactNode;
  sample?: React.ReactNode;
}

export const registry: GalleryEntry[] = [
  // ---- variant-sweep components ----
  {
    name: "Button",
    Component: Button,
    variants: {
      variant: [
        "default",
        "destructive",
        "destructiveOutline",
        "warning",
        "warningOutline",
        "outline",
        "outlinePrimary",
        "secondary",
        "secondaryLight",
        "ghost",
        "light",
        "lightSecondary",
        "link",
      ],
      size: ["default", "sm", "md", "lg", "icon", "icon-sm", "icon-xs"],
    },
    sampleChildren: "Button",
  },
  {
    name: "Badge",
    Component: Badge,
    variants: {
      variant: ["default", "secondary", "destructive", "outline", "outlinePrimary"],
    },
    sampleChildren: "Badge",
  },
  {
    name: "Alert",
    Component: Alert,
    variants: { variant: ["default", "destructive", "warning"] },
    sampleChildren: (
      <>
        <AlertTitle>Heads up</AlertTitle>
        <AlertDescription>This is an alert message.</AlertDescription>
      </>
    ),
  },
  {
    name: "Bubble",
    Component: Bubble,
    variants: {
      variant: ["default", "secondary", "muted", "tinted", "outline", "ghost", "destructive"],
    },
    sampleChildren: "Chat bubble text",
  },
  {
    name: "Marker",
    Component: Marker,
    variants: { variant: ["default", "separator", "border"] },
    sampleChildren: "Marker label",
  },

  // ---- fixed-sample components ----
  { name: "Input", sample: S.InputSample },
  { name: "Textarea", sample: S.TextareaSample },
  { name: "Label", sample: S.LabelSample },
  { name: "Switch", sample: S.SwitchSample },
  { name: "Checkbox", sample: S.CheckboxSample },
  { name: "RadioGroup", sample: S.RadioGroupSample },
  { name: "Slider", sample: S.SliderSample },
  { name: "Progress", sample: S.ProgressSample },
  { name: "Avatar", sample: S.AvatarSample },
  { name: "Skeleton", sample: S.SkeletonSample },
  { name: "Separator", sample: S.SeparatorSample },
  { name: "Card", sample: S.CardSample },
  { name: "Tabs", sample: S.TabsSample },
  { name: "Tooltip", sample: S.TooltipSample },
  { name: "Select", sample: S.SelectSample },
  { name: "Combobox", sample: S.ComboboxSample },
  { name: "Dialog", sample: S.DialogSample },
  { name: "AlertDialog", sample: S.AlertDialogSample },
  { name: "DropdownMenu", sample: S.DropdownMenuSample },
  { name: "Popover", sample: S.PopoverSample },
  { name: "Sheet", sample: S.SheetSample },
  { name: "Command", sample: S.CommandSample },
  { name: "Accordion", sample: S.AccordionSample },
  { name: "Collapsible", sample: S.CollapsibleSample },
  { name: "Table", sample: S.TableSample },
  { name: "ScrollArea", sample: S.ScrollAreaSample },
  { name: "Toast", sample: S.ToastSample },
];

// Components that can't render standalone — they need app context (a data
// fetch, a provider, a file, or live query state). Listed so the gallery is
// honest about what it doesn't cover rather than silently omitting them.
export const notPreviewable: { name: string; reason: string }[] = [
  { name: "Sidebar", reason: "needs SidebarProvider + a full nav tree" },
  { name: "Chart", reason: "needs a chart config and dataset" },
  { name: "Calendar", reason: "date-picker; usually driven by form state" },
  { name: "Resizable", reason: "needs panel layout + persisted sizes" },
  { name: "Toaster", reason: "app-level portal (see Toast for the trigger)" },
  { name: "PdfRenderer", reason: "needs a PDF file to render" },
  { name: "CodeHighlighter", reason: "needs source code input" },
  { name: "DatasetSelect", reason: "fetches datasets for the current project" },
  { name: "QueueSelect", reason: "fetches labeling queues for the project" },
  { name: "GroupByPeriodSelect", reason: "bound to dashboard time state" },
];
