"use client";

import { useDialKit } from "dialkit";

import { type ProjectDetails } from "@/lib/actions/project";

type Slider = [number, number, number, number];

// Dev-only: overrides free-tier usage so the sidebar card and the 80% banner can be previewed.
// Returns null (use real data) in production or when `mock` is off.
export function useUsageDials(details: ProjectDetails): { show: boolean; details: ProjectDetails } | null {
  const { mock, show, gbUsed, gbLimit } = useDialKit(
    "Usage",
    {
      mock: true,
      show: true,
      gbUsed: [0.9, 0, 12, 0.0001] as Slider,
      gbLimit: [1, 0, 10, 0.5] as Slider,
    },
    { id: "sidebar-usage", persist: true }
  );

  if (process.env.NODE_ENV === "production" || !mock) return null;
  return { show, details: { ...details, gbUsedThisMonth: gbUsed, gbLimit } };
}
