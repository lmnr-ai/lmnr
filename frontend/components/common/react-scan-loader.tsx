"use client";

import Script from "next/script";

// react-scan's auto.global.js self-starts on load with its own defaults
// (toolbar visible, scanning enabled) and does NOT read a
// window.__REACT_SCAN_OPTIONS__ global set before it loads -- that was dead
// code (verified empirically: the toolbar opened with default options
// regardless). The only supported way to override its options after load is
// the imperative window.reactScan(...) re-entry point the bundle installs,
// so reconfiguring has to happen from onLoad rather than a second
// independently-scheduled <script>. onLoad requires a Client Component,
// which is why this is split out of the (server) root layout.
export default function ReactScanLoader() {
  return (
    <Script
      src="https://unpkg.com/react-scan/dist/auto.global.js"
      crossOrigin="anonymous"
      strategy="afterInteractive"
      onLoad={() => {
        (window as unknown as { reactScan?: (options: Record<string, unknown>) => void }).reactScan?.({
          enabled: false,
          showToolbar: true,
          animationSpeed: "off",
        });
      }}
    />
  );
}
