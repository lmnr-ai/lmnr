"use client";

import { useEffect } from "react";

import { type Feature, track } from "@/lib/posthog";

interface PageViewTrackerProps {
  feature: Feature;
  action?: string;
  properties?: Record<string, unknown>;
}

export default function PageViewTracker({ feature, action = "page_viewed", properties }: PageViewTrackerProps) {
  useEffect(() => {
    track(feature, action, properties);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
