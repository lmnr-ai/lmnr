"use client";

// Fixed sample compositions for components that don't fit the variant-sweep
// model (compound APIs, interactive/stateful, or portal-based). Each is a small
// self-contained demo the gallery renders as-is. TEMPORARY tooling.

import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Combobox } from "@/components/ui/combobox";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Bell, Check, Search, User } from "@/components/ui/icon-lib";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/lib/hooks/use-toast";

export const InputSample = (
  <div className="flex w-64 flex-col gap-2">
    <Label htmlFor="g-input">Label</Label>
    <Input id="g-input" placeholder="Type here…" />
    <Input placeholder="Disabled" disabled />
  </div>
);

export const TextareaSample = <Textarea className="w-64" placeholder="Multi-line text…" />;

export const SwitchSample = (
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-2">
      <Switch id="g-sw1" />
      <Label htmlFor="g-sw1">Off</Label>
    </div>
    <div className="flex items-center gap-2">
      <Switch id="g-sw2" defaultChecked />
      <Label htmlFor="g-sw2">On</Label>
    </div>
  </div>
);

export const CheckboxSample = (
  <div className="flex items-center gap-6">
    <div className="flex items-center gap-2">
      <Checkbox id="g-cb1" />
      <Label htmlFor="g-cb1">Unchecked</Label>
    </div>
    <div className="flex items-center gap-2">
      <Checkbox id="g-cb2" defaultChecked />
      <Label htmlFor="g-cb2">Checked</Label>
    </div>
  </div>
);

export const SliderSample = <Slider defaultValue={[50]} max={100} step={1} className="w-64" />;

export const ProgressSample = (
  <div className="flex w-64 flex-col gap-3">
    <Progress value={30} />
    <Progress value={70} />
  </div>
);

export const AvatarSample = (
  <div className="flex items-center gap-3">
    <Avatar>
      <AvatarFallback>
        <User className="size-4" />
      </AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback>KY</AvatarFallback>
    </Avatar>
  </div>
);

export const SkeletonSample = (
  <div className="flex w-64 items-center gap-3">
    <Skeleton className="size-10 rounded-full" />
    <div className="flex flex-1 flex-col gap-2">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-2/3" />
    </div>
  </div>
);

export const SeparatorSample = (
  <div className="flex flex-col gap-3 text-sm">
    <span>Above</span>
    <Separator />
    <div className="flex h-5 items-center gap-3">
      <span>Left</span>
      <Separator orientation="vertical" />
      <span>Right</span>
    </div>
  </div>
);

export const LabelSample = <Label>A form label</Label>;

export const CardSample = (
  <Card className="w-72">
    <CardHeader>
      <CardTitle>Card title</CardTitle>
      <CardDescription>A short description of the card.</CardDescription>
    </CardHeader>
    <CardContent className="text-sm text-muted-foreground">Card body content goes here.</CardContent>
    <CardFooter>
      <Button size="sm">Action</Button>
    </CardFooter>
  </Card>
);

export const TabsSample = (
  <Tabs defaultValue="one" className="w-72">
    <TabsList>
      <TabsTrigger value="one">One</TabsTrigger>
      <TabsTrigger value="two">Two</TabsTrigger>
      <TabsTrigger value="three">Three</TabsTrigger>
    </TabsList>
    <TabsContent value="one" className="text-sm text-muted-foreground">First tab.</TabsContent>
    <TabsContent value="two" className="text-sm text-muted-foreground">Second tab.</TabsContent>
    <TabsContent value="three" className="text-sm text-muted-foreground">Third tab.</TabsContent>
  </Tabs>
);

export const TooltipSample = (
  <TooltipProvider>
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="outline">Hover me</Button>
      </TooltipTrigger>
      <TooltipContent>A helpful tooltip</TooltipContent>
    </Tooltip>
  </TooltipProvider>
);

export const RadioGroupSample = (
  <RadioGroup defaultValue="a" className="flex flex-col gap-2">
    {["a", "b", "c"].map((v) => (
      <div key={v} className="flex items-center gap-2">
        <RadioGroupItem value={v} id={`g-radio-${v}`} />
        <Label htmlFor={`g-radio-${v}`}>Option {v.toUpperCase()}</Label>
      </div>
    ))}
  </RadioGroup>
);

export const SelectSample = (
  <Select defaultValue="apple">
    <SelectTrigger className="w-48">
      <SelectValue placeholder="Pick one" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="apple">Apple</SelectItem>
      <SelectItem value="banana">Banana</SelectItem>
      <SelectItem value="cherry">Cherry</SelectItem>
    </SelectContent>
  </Select>
);

export const DialogSample = (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline">Open dialog</Button>
    </DialogTrigger>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>Dialog title</DialogTitle>
        <DialogDescription>This is a dialog description.</DialogDescription>
      </DialogHeader>
      <DialogFooter>
        <Button>Confirm</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);

export const AlertDialogSample = (
  <AlertDialog>
    <AlertDialogTrigger asChild>
      <Button variant="destructiveOutline">Delete…</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
        <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>Cancel</AlertDialogCancel>
        <AlertDialogAction>Delete</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export const DropdownMenuSample = (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="outline">Menu</Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuLabel>Actions</DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem>Edit</DropdownMenuItem>
      <DropdownMenuItem>Duplicate</DropdownMenuItem>
      <DropdownMenuItem>Delete</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
);

export const PopoverSample = (
  <Popover>
    <PopoverTrigger asChild>
      <Button variant="outline">Open popover</Button>
    </PopoverTrigger>
    <PopoverContent className="text-sm">Popover content lives here.</PopoverContent>
  </Popover>
);

export const SheetSample = (
  <Sheet>
    <SheetTrigger asChild>
      <Button variant="outline">Open sheet</Button>
    </SheetTrigger>
    <SheetContent>
      <SheetHeader>
        <SheetTitle>Sheet title</SheetTitle>
        <SheetDescription>A slide-in panel from the edge.</SheetDescription>
      </SheetHeader>
    </SheetContent>
  </Sheet>
);

export const AccordionSample = (
  <Accordion type="single" collapsible className="w-72">
    <AccordionItem value="a">
      <AccordionTrigger>Section one</AccordionTrigger>
      <AccordionContent>Content for section one.</AccordionContent>
    </AccordionItem>
    <AccordionItem value="b">
      <AccordionTrigger>Section two</AccordionTrigger>
      <AccordionContent>Content for section two.</AccordionContent>
    </AccordionItem>
  </Accordion>
);

export const TableSample = (
  <Table className="w-72">
    <TableHeader>
      <TableRow>
        <TableHead>Name</TableHead>
        <TableHead>Role</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>Ada</TableCell>
        <TableCell>Engineer</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>Grace</TableCell>
        <TableCell>Admiral</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);

export const ScrollAreaSample = (
  <ScrollArea className="h-32 w-56 rounded-md border border-border p-3">
    <div className="flex flex-col gap-2 text-sm">
      {Array.from({ length: 20 }, (_, i) => (
        <span key={i}>Scrollable row {i + 1}</span>
      ))}
    </div>
  </ScrollArea>
);

export const CommandSample = (
  <Command className="w-64 rounded-md border border-border">
    <CommandInput placeholder="Search…" />
    <CommandList>
      <CommandEmpty>No results.</CommandEmpty>
      <CommandGroup heading="Suggestions">
        <CommandItem>
          <Search className="mr-2 size-4" /> Search
        </CommandItem>
        <CommandItem>
          <Bell className="mr-2 size-4" /> Notifications
        </CommandItem>
        <CommandItem>
          <Check className="mr-2 size-4" /> Done
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);

function CollapsibleDemo() {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="w-64">
      <CollapsibleTrigger asChild>
        <Button variant="outline">{open ? "Hide" : "Show"} details</Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 rounded-md border border-border p-3 text-sm text-muted-foreground">
        Collapsible content that expands and collapses.
      </CollapsibleContent>
    </Collapsible>
  );
}
export const CollapsibleSample = <CollapsibleDemo />;

function ComboboxDemo() {
  const [value, setValue] = useState<string | null>("apple");
  return (
    <Combobox
      placeholder="Pick a fruit"
      items={[
        { value: "apple", label: "Apple" },
        { value: "banana", label: "Banana" },
        { value: "cherry", label: "Cherry" },
      ]}
      value={value}
      setValue={setValue}
      className="w-48"
    />
  );
}
export const ComboboxSample = <ComboboxDemo />;

function ToastDemo() {
  const { toast } = useToast();
  return (
    <div className="flex gap-2">
      <Button variant="outline" onClick={() => toast({ title: "Saved", description: "Your changes were saved." })}>
        Show toast
      </Button>
      <Button
        variant="destructiveOutline"
        onClick={() => toast({ variant: "destructive", title: "Something went wrong" })}
      >
        Error toast
      </Button>
    </div>
  );
}
export const ToastSample = <ToastDemo />;
