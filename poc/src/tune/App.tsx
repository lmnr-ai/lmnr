import { useSyncExternalStore } from 'react';
import { DialTimeline, useDialTimeline } from 'dialkit';
import { DialStore } from 'dialkit/store';
import { PANEL_ID, TIMELINE } from '../anim/timeline';
import { TraceScene } from '../scene/TraceScene';

const subscribe = (cb: () => void) => DialStore.subscribe(PANEL_ID, cb);
const snapshot = () => DialStore.getValues(PANEL_ID);

export const App = () => {
  // The hook owns the dock and the transport. It does NOT drive the scene —
  // that keeps this file's render path identical to the Remotion one.
  const timeline = useDialTimeline('Trace view', TIMELINE, {
    id: PANEL_ID,
    loop: true,
    persist: true,
  });

  // Live edits from the dock, fed straight into the shared sampler.
  const values = useSyncExternalStore(subscribe, snapshot, snapshot);

  return (
    <>
      <div className="h-screen w-screen pb-64">
        <TraceScene t={timeline.time} values={values} />
      </div>

      <div className="pointer-events-none fixed left-4 top-4 rounded-md border border-[#2f2f2f] bg-[#121212]/90 px-3 py-2 font-mono text-[11px] text-[#9d9d9d]">
        t = {timeline.time.toFixed(3)}s
        <span className="ml-2 text-[#d07149]">tuning</span>
      </div>

      <DialTimeline />
    </>
  );
};
