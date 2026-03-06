"use client";

import { TraceDiffStoreProvider } from "./store";
import TraceDiffViewInner from "./view";

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
