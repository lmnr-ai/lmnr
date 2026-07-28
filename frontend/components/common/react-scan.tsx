"use client";

import { useEffect } from "react";
import { scan } from "react-scan";

// Dev-only render profiler. Starts disabled + non-animating so nothing overlays
// the UI until you toggle scanning on from the react-scan toolbar.
export default function ReactScan() {
  useEffect(() => {
    scan({
      enabled: false,
      showToolbar: true,
      animationSpeed: "off",
    });
  }, []);

  return null;
}
