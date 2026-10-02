import {clipEnd, type Micro20Controls, type PreludeTiming} from './timeline';

type SpinWindow = {at: number; end: number; turnsPerSecond: number};
/** Integrate piecewise angular velocity, not time × the current stage speed.
 * Higher priority wins overlaps: analysis > zoom > descent > stop/open > entry.
 * Descent reverses, gaps hold, and no stage can reset accumulated phase.
 * Input timing has already been dependency-resolved by the shared sampler. */
export function spinnerAngle(time: number, timing: PreludeTiming, controls: Micro20Controls): number {
  const windows: SpinWindow[] = [
    {at: clipEnd(timing.analysisZoomOut), end: clipEnd(timing.analysisAgentScaleOut), turnsPerSecond: controls.spinnerAnalysisSpeed},
    {at: timing.analysisZoomOut.at, end: clipEnd(timing.analysisZoomOut), turnsPerSecond: controls.spinnerZoomSpeed},
    {at: timing.bashDescent.at, end: clipEnd(timing.bashDescent), turnsPerSecond: -controls.spinnerDescentSpeed},
    {at: timing.blueBashStop.at, end: Math.max(clipEnd(timing.blueBashStop), clipEnd(timing.bashExpand)), turnsPerSecond: controls.spinnerStopSpeed},
    {at: timing.blueBashEntry.at, end: clipEnd(timing.blueBashEntry), turnsPerSecond: controls.spinnerEntrySpeed},
  ].filter(window => window.end > window.at);
  const end = Number.isFinite(time) ? Math.max(0, time) : 0;
  const boundaries = [...new Set([0, end, ...windows.flatMap(window => [window.at, window.end]).filter(t => t > 0 && t < end)])].sort((a, b) => a - b);
  let turns = 0;
  for (let i = 1; i < boundaries.length; i++) {
    const from = boundaries[i - 1], to = boundaries[i];
    const midpoint = (from + to) / 2;
    const active = windows.find(window => midpoint >= window.at && midpoint < window.end);
    turns += (to - from) * (active?.turnsPerSecond ?? 0);
  }
  return turns * 360;
}
