import {TimelineStore} from 'dialkit';

// Transport subscriptions do not distinguish deliberate seek/replay calls
// from animation-frame ticks. Observe only the mounted Ultimate3 panel.
type Seek = typeof TimelineStore.seek;
type Replay = typeof TimelineStore.replay;
const listeners = new Map<string, Set<{notify: (time: number) => void}>>();
let originalSeek: Seek | undefined, observedSeek: Seek | undefined;
let originalReplay: Replay | undefined, observedReplay: Replay | undefined;

function notifyJump(id: string) {
  const time = TimelineStore.getTransport(id).time;
  for (const {notify} of [...(listeners.get(id) ?? [])]) notify(time);
}

export function observeUltimate3TransportJump(panelId: string, listener: (time: number) => void): () => void {
  if (typeof TimelineStore.seek !== 'function' || typeof TimelineStore.replay !== 'function'
    || typeof TimelineStore.getTimeline !== 'function' || typeof TimelineStore.getTransport !== 'function')
    throw new Error('DialKit timeline transport API is unavailable');
  if (!originalSeek) {
    originalSeek = TimelineStore.seek;
    originalReplay = TimelineStore.replay;
    const delegateSeek = originalSeek, delegateReplay = originalReplay;
    observedSeek = function (this: typeof TimelineStore, id: string, time: number) {
      const result = Reflect.apply(delegateSeek, this, [id, time]);
      if (this === TimelineStore && Number.isFinite(time) && TimelineStore.getTimeline(id)) notifyJump(id);
      return result;
    } as Seek;
    observedReplay = function (this: typeof TimelineStore, id: string) {
      const result = Reflect.apply(delegateReplay, this, [id]);
      if (this === TimelineStore && TimelineStore.getTimeline(id) && TimelineStore.getTransport(id).duration > 0) notifyJump(id);
      return result;
    } as Replay;
    TimelineStore.seek = observedSeek;
    TimelineStore.replay = observedReplay;
  } else if (TimelineStore.seek !== observedSeek || TimelineStore.replay !== observedReplay) {
    throw new Error('DialKit timeline transport was replaced while Ultimate3 was mounted');
  }
  const active = listeners.get(panelId) ?? new Set<{notify: (time: number) => void}>();
  const subscription = {notify: listener};
  active.add(subscription);
  listeners.set(panelId, active);
  let subscribed = true;
  return () => {
    if (!subscribed) return;
    subscribed = false;
    active.delete(subscription);
    if (!active.size) listeners.delete(panelId);
    if (!listeners.size) {
      if (TimelineStore.seek === observedSeek) TimelineStore.seek = originalSeek!;
      if (TimelineStore.replay === observedReplay) TimelineStore.replay = originalReplay!;
      originalSeek = observedSeek = undefined;
      originalReplay = observedReplay = undefined;
    }
  };
}
