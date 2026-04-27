"use client";

import { type UseFormWatch } from "react-hook-form";

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { type TraceRow } from "@/lib/traces/types";
import { cn } from "@/lib/utils";

import TestPanel, { type TestView } from "./test-panel";
import { type ManageSignalForm } from "./types";

export default function TestPanelDrawer({
  open,
  onOpenChange,
  watch,
  selectedTrace,
  setSelectedTrace,
  isExecuting,
  testOutput,
  execute,
  testView,
  setTestView,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  watch: UseFormWatch<ManageSignalForm>;
  selectedTrace: TraceRow | null;
  setSelectedTrace: (trace: TraceRow | null) => void;
  isExecuting: boolean;
  testOutput: string;
  execute: () => void;
  testView: TestView;
  setTestView: (view: TestView) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn("sm:max-w-none! p-0 flex flex-col w-[40vw]")}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        <SheetTitle className="sr-only">Test signal</SheetTitle>
        <TestPanel
          watch={watch}
          selectedTrace={selectedTrace}
          setSelectedTrace={setSelectedTrace}
          isExecuting={isExecuting}
          testOutput={testOutput}
          execute={execute}
          onClose={() => onOpenChange(false)}
          testView={testView}
          setTestView={setTestView}
        />
      </SheetContent>
    </Sheet>
  );
}
