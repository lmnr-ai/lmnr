"use client";

import "dialkit/styles.css";

import { DialRoot, DialTimeline } from "dialkit";

// The one dial dock for the landing page, DEV ONLY.
//
// `DialRoot` and `DialTimeline` are not per-panel chrome — each renders EVERY
// panel and timeline registered anywhere in the tree. So mounting them inside
// each section's dials module draws a full copy of the whole dock per section
// (two sections => every timeline listed twice). They belong at the root,
// mounted once; the per-section modules only call the `useDialKit` /
// `useDialTimeline` hooks that register into the shared store.
const DialDock = () => (
  <>
    <DialRoot position="top-right" defaultOpen={false} />
    <DialTimeline />
  </>
);

export default DialDock;
