"use client";

import { Label } from "@/components/ui/label";

import LlmProfileSection from "./llm-profile-section";
import ReportsSection from "./reports-section";

export default function AdditionalSettingsSection() {
  return (
    <div className="grid gap-2">
      <Label className="text-sm font-medium">Additional settings</Label>
      <div className="grid gap-6 rounded-lg ring-1 ring-border bg-surface-up p-4">
        <ReportsSection />
        <LlmProfileSection />
      </div>
    </div>
  );
}
