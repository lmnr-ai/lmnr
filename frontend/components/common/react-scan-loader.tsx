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
//
// Pinned to the version this reconfiguration was validated against -- the
// unversioned /react-scan/ path resolves to whatever is currently tagged
// `latest`, and a future release changing/removing window.reactScan (or its
// option semantics; several option names are inconsistently supported
// across versions, e.g. `trackUnnecessaryRenders`) would silently reopen the
// exact "toolbar defaults to visible/animated" bug this loader fixes. Bump
// deliberately and re-verify against the CLAUDE.md notes on react-scan's API
// limitations, not opportunistically.
const REACT_SCAN_VERSION = "0.5.7";

export default function ReactScanLoader() {
  return (
    <Script
      src={`https://unpkg.com/react-scan@${REACT_SCAN_VERSION}/dist/auto.global.js`}
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
