"use client";

import { TraceDiffStoreProvider } from "./trace-diff-store";
import TraceDiffViewInner from "./trace-diff-view-inner";

interface TraceDiffViewProps {
  leftTraceId: string;
  rightTraceId?: string;
}

const TraceDiffView = (props: TraceDiffViewProps) => (
  <TraceDiffStoreProvider>
    <TraceDiffViewInner {...props} />
  </TraceDiffStoreProvider>
);

export default TraceDiffView;
