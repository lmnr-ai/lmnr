import {COST_PURPLE_CLICK, COST_YELLOW_CLICK, type ClickTrack} from '../ratchet-click';
import {sampleMicro16} from './sample';
import {normalizeControls, normalizeTiming, resolveMicro16Clips, type Controls, type Timing} from './timeline';

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const smoothstep = (v: number) => { const p = clamp(v); return p * p * (3 - 2 * p); };
const screenPan = (x: number) => Math.max(-1, Math.min(1, (x - 640) / 640));
const visible = (x: number, y: number) => x > -90 && x < 1370 && y > -90 && y < 810;
const linearPhase = (time: number, at: number, duration: number) => duration <= 0 ? Number(time >= at) : clamp((time - at) / duration);

/** Pure audio sampler: authored Cost timing/controls are the sole source of windows, visibility and camera-relative pan. */
export function costClickTracks(timingInput: Partial<Timing> = {}, controlsInput: Partial<Controls> = {}, offset = 0, trimEnd = Infinity): ClickTrack[] {
  const timing = normalizeTiming(timingInput), controls = normalizeControls(controlsInput), resolved = resolveMicro16Clips(timing);
  const duration = (key: keyof Timing) => timing[key].duration === 0 ? 0 : resolved.find(c => c.key === key)!.duration;
  const local = (global: number) => global - offset;
  const bounded = (end: number) => offset + Math.min(end, trimEnd);
  const tracks: ClickTrack[] = (['cheapLegOneRight', 'cheapLegTwoLeft', 'cheapLegThreeRight'] as const).map((key, row) => ({
    id: `cost-yellow-${row + 1}`, start: offset + timing[key].at, end: bounded(timing[key].at + duration(key)), preset: COST_YELLOW_CLICK,
    // Short passes use a compact edge ramp, not the preset's long motor ramps.
    rateScaleAt: g => .65 + .35 * Math.sin(Math.PI * linearPhase(local(g), timing[key].at, duration(key))),
    gainAt: g => { const s = sampleMicro16(local(g), controls, timing), a = s.cheapAgents[row]; return visible(a.x - s.camera.x, a.y - s.camera.y) ? 1 : 0; },
    panAt: g => { const s = sampleMicro16(local(g), controls, timing); return screenPan(s.cheapAgents[row].x - s.camera.x); },
  }));
  const bashStart = Math.min(timing.purpleBashEntry.at, timing.purpleBashStop.at);
  const bashEnd = Math.max(timing.purpleBashEntry.at + duration('purpleBashEntry'), timing.purpleBashStop.at + duration('purpleBashStop'));
  tracks.push({id: 'cost-purple-bash-right', start: offset + bashStart, end: bounded(bashEnd), preset: COST_PURPLE_CLICK,
    // Entry and stop are one union track; the stop clip reduces cadence all the way to zero.
    rateScaleAt: g => {
      const t = local(g), entry = timing.purpleBashEntry, stop = timing.purpleBashStop;
      const entryDuration = duration('purpleBashEntry'), stopDuration = duration('purpleBashStop');
      if (stopDuration > 0 && t >= stop.at && t < stop.at + stopDuration) return 1 - linearPhase(t, stop.at, stopDuration);
      if (entryDuration > 0 && t >= entry.at && t < entry.at + entryDuration) {
        const joinedStop = stopDuration > 0 && stop.at <= entry.at + entryDuration && stop.at + stopDuration >= entry.at + entryDuration;
        return joinedStop ? 1 : clamp((entry.at + entryDuration - t) / Math.min(.15, entryDuration / 3));
      }
      return 0;
    },
    gainAt: g => { const s = sampleMicro16(local(g), controls, timing), x = s.bashAgent.x - s.camera.x, y = s.bashAgent.y - s.camera.y; return visible(x, y) ? 1 : 0; },
    panAt: g => { const s = sampleMicro16(local(g), controls, timing); return screenPan(s.bashAgent.x - s.camera.x); },
  });
  const descentDuration = duration('bashDescent');
  tracks.push({id: 'cost-purple-bash-down', start: offset + timing.bashDescent.at, end: bounded(timing.bashDescent.at + descentDuration), preset: COST_PURPLE_CLICK,
    rateScaleAt: g => Math.sin(Math.PI * linearPhase(local(g), timing.bashDescent.at, descentDuration)),
    gainAt: g => { const s = sampleMicro16(local(g), controls, timing), x = s.bashAgent.x - s.camera.x, y = s.bashAgent.y - s.camera.y; return visible(x, y) ? 1 : 0; },
    panAt: g => { const s = sampleMicro16(local(g), controls, timing); return screenPan(s.bashAgent.x - s.camera.x); },
  });
  const budgetStart = timing.purpleBudgetEntry.at, budgetEnd = timing.budgetDepletion.at + timing.budgetDepletion.duration;
  tracks.push({id: 'cost-purple-budget', start: offset + budgetStart, end: bounded(budgetEnd), preset: COST_PURPLE_CLICK,
    rateScaleAt: g => { const t = local(g), entry = linearPhase(t, budgetStart, duration('purpleBudgetEntry'));
      const powered = smoothstep(linearPhase(t, timing.budgetRun.at, timing.budgetRun.duration)) * (1 - smoothstep(linearPhase(t, timing.budgetDepletion.at, timing.budgetDepletion.duration)));
      return clamp(Math.max(.55 * Math.sin(Math.PI * entry), powered)); },
    gainAt: g => { const s = sampleMicro16(local(g), controls, timing), x = s.budgetAgent.x - s.camera.x, y = s.budgetAgent.y - s.camera.y; return visible(x, y) ? clamp(Math.max(s.budgetPower, 1 - linearPhase(local(g), timing.purpleBudgetEntry.at, duration('purpleBudgetEntry')))) : 0; },
    panAt: g => { const s = sampleMicro16(local(g), controls, timing); return screenPan(s.budgetAgent.x - s.camera.x); },
  });
  return tracks.filter(track => track.end > track.start);
}
