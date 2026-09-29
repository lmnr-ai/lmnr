import {sampleIssueOutro} from './outro';
import {micro20PostludeDurationFrames, MICRO_20_OUTRO_DURATION} from './timeline';
import {GRID_CELLS, HERO_CELL, HERO_CENTER, mappedCellCenter, mapIssueWorld} from './geometry';
import {spinnerAngle} from './spinner';
import {narrationOpacity, sampleNarration} from './narration';
export {HERO_CELL, HERO_CENTER} from './geometry';
import {GRID as MACRO_GRID} from '../micro-17/geometry';
import {BASH} from '../micro-16/geometry';
import {START_CELLS} from '../micro-15/starting-positions';
import {sampleMicro15} from '../micro-15/sample';
import {MICRO_15_SUBTITLE_KEYS, type Micro15Controls} from '../micro-15/timeline';
import {HIGHLIGHT_LINES, PAPER_LINE_HEIGHT} from './paper';
import {MICRO_20_DEFAULTS, MICRO_20_ISSUE_DEFAULTS, MICRO_20_ISSUE_TIMING, PRELUDE_TIMING, ISSUE_START, effectiveIssueStart, evaluateClip, clipEnd, normalizeIssueTiming, normalizeMicro20Controls, resolvePreludeSchedule, unit, type Micro20Controls, type PreludeTiming, type IssueTiming, type ClipTiming} from './timeline';

const smooth = (value: number) => {const p = unit(value); return p * p * (3 - 2 * p);};
export const warningDistance = (cell: number) => {
  const point = mappedCellCenter(cell);
  return Math.hypot(point.x - HERO_CENTER.x, point.y - HERO_CENTER.y);
};
export const scanSoftness = (controls: Micro20Controls) => 78 * (.25 + controls.radialSoftness);
export const requiredScanRadius = (controls: Micro20Controls, renderedScale = 1) => Math.max(...Object.values(START_CELLS).map(warningDistance)) * renderedScale + scanSoftness(controls);
export function sampleMicro20(timeInput: number, rawControls: Partial<Micro20Controls> = MICRO_20_DEFAULTS,
  timingInput: Partial<PreludeTiming> = PRELUDE_TIMING, issueControls: Micro15Controls = MICRO_20_ISSUE_DEFAULTS,
  issueTiming: Partial<IssueTiming> = MICRO_20_ISSUE_TIMING, issueStartInput = ISSUE_START, includeOutro = true, progressOverride?: Partial<Record<keyof PreludeTiming, number>>, authoredIssues?: {progress?: Partial<Record<keyof IssueTiming, number>>}) {
  const time = Number.isFinite(timeInput) ? Math.max(0, timeInput) : 0;
  const controls = normalizeMicro20Controls(rawControls), timing = resolvePreludeSchedule(timingInput);
  const issueStart = effectiveIssueStart(timingInput, issueStartInput);
  const ownedTiming = normalizeIssueTiming(issueTiming);
  const narration = sampleNarration(time, timing, ownedTiming, issueStart);
  const subtitleOpacity = narrationOpacity(narration, time, timing, ownedTiming, issueStart);
  const progress = Object.fromEntries(Object.entries(timing).map(([key, clip]) => [key, progressOverride?.[key as keyof PreludeTiming] ?? evaluateClip(clip, time)])) as Record<keyof PreludeTiming, number>;
  // Retain raw authored progress for diagnostics/serialization. Geometry uses
  // the identical bounded policy in preview, inspection and export.
  const p = Object.fromEntries(Object.entries(progress).map(([key, value]) => [key, unit(value)])) as typeof progress;
  const zoom = p.analysisZoomOut;
  const cameraScale = (78 / MACRO_GRID.pitch) ** zoom;
  const renderedGridScale = MACRO_GRID.pitch * cameraScale / 78;
  const radius = controls.radialCircleRadius * p.analysisCircleGrow;
  const requiredRadius = requiredScanRadius(controls, renderedGridScale);
  const scanComplete = radius >= requiredRadius - 1e-7;
  const completedPrelude = p.analysisZoomOut === 1 && p.analysisTraceCollapse === 1 && p.analysisLocalGridFade === 1
    && p.analysisAgentScaleOut === 1 && p.analysisLayout === 1 && p.analysisCircleFade === 1;
  const validation = !scanComplete
    ? `Scan requires radius ${requiredRadius.toFixed(2)}px for full warning arrival (current ${radius.toFixed(2)}px).`
    : !completedPrelude ? 'Prelude zoom, collapse, fade, exit and readiness gate endpoints must finish at 1 before handoff.' : null;
  if (time >= issueStart && scanComplete && completedPrelude) {
    const outroStart = micro20PostludeDurationFrames({...rawControls, preludeTiming: timingInput, issueControls, issueTiming, issueStart: issueStartInput}) / 30;
    const outroTime = includeOutro && time >= outroStart ? Math.min(MICRO_20_OUTRO_DURATION, time - outroStart) : null;
    const local = Math.round(((outroTime === null ? time : outroStart) - issueStart) * 1e9) / 1e9;
    // Opt-in full authored curves for source22; historical source20/15 stay literal.
    const authored = authoredIssues ? (key: string, effective: ClipTiming, eased: boolean) => {
      const clip = ownedTiming[key as keyof IssueTiming];
      const delta = (authoredIssues.progress?.[key as keyof IssueTiming] ?? evaluateClip(clip, local)) - evaluateClip(clip, local);
      const raw = unit(evaluateClip(effective, local) + delta);
      const value = raw < 1e-9 ? 0 : raw > 1 - 1e-9 ? 1 : raw;
      return eased && !effective.transition ? smooth(value) : value;
    } : undefined;
    const source = sampleMicro15(local, {...issueControls, warningAppearanceDuration: 0}, ownedTiming, authored, authoredIssues ? clipEnd : undefined);
    // Source15 has an intentional live/pure subtitle split. This local adapter
    // evaluates its full authored spring clips identically on every render path.
    const subtitles = Object.freeze(Object.fromEntries(MICRO_15_SUBTITLE_KEYS.map(key => [key, authoredIssues?.progress?.[key] ?? evaluateClip(ownedTiming[key], local)]))) as typeof source.subtitles;
    return {time, issueStart, narration, subtitleOpacity, phase: 'issues' as const, outro: outroTime === null ? null : sampleIssueOutro({...source, subtitles}, outroTime), issue: {...source, subtitles}, issueWorld: mapIssueWorld(source), progress, controls, validation: null};
  }
  const descent = BASH.descent * p.bashDescent;
  const angle = spinnerAngle(time, timing, controls);
  const bashAgent = {x: -80 + 360 * p.blueBashEntry + 60 * p.blueBashStop, y: BASH.y + 60 + descent, angle};
  const camera = {x: 0, y: 960 + descent};
  // Animation17's actual camera/content relationship, with source15's final
  // pitch. Gray occupants/report become 12px; the hero has its own scale law.
  const contentScale = (1 / cameraScale) ** (1 - Math.log(10) / Math.log(MACRO_GRID.pitch / 78));
  const contentScreenScale = cameraScale * contentScale;
  const heroScreenScale = (54 / 120) ** zoom;
  // analysisLayout is a historical readiness/hold gate, never a displacement.
  const origin = {
    x: 640 - (640 - bashAgent.x) * (1 - zoom) * cameraScale,
    y: 360 - (360 - (bashAgent.y - camera.y)) * (1 - zoom) * cameraScale,
  };
  const gridPitch = MACRO_GRID.pitch * cameraScale;
  const mapCell = (cell: number) => {
    const point = mappedCellCenter(cell);
    const worldX = (point.x - HERO_CENTER.x) * MACRO_GRID.pitch / 78;
    const worldY = (point.y - HERO_CENTER.y) * MACRO_GRID.pitch / 78;
    return {worldX, worldY, x: origin.x + worldX * cameraScale, y: origin.y + worldY * cameraScale};
  };
  const warnings = Object.entries(START_CELLS).map(([id, cell]) => {
    // Arrival uses screen distance even when an authored zoom endpoint is partial.
    const distance = warningDistance(cell) * renderedGridScale;
    return {id, cell, ...mapCell(cell), distance, scale: smooth((radius - distance) / scanSoftness(controls))};
  });
  const dots = GRID_CELLS.map(({cell}) => {
    const warning = warnings.find(value => value.cell === cell);
    return {cell, ...mapCell(cell), radius: 60 * contentScreenScale,
      scale: cell === HERO_CELL ? p.analysisAgentScaleOut : warning ? 1 - warning.scale : 1};
  });
  // Detection follows the authored highlight bar. The source16 marker pops
  // beside the agent, then leaves during the first quarter of the pullback.
  // It is decoration only: the world origin/camera remain agent-centered.
  const detectionWarning = {x: -111 + 43.3985, y: -96 + 40.302,
    scale: smooth(p.bashHighlight * 3) * (1 - smooth(zoom * 4))};
  const highlightBounds = HIGHLIGHT_LINES.map(line => ({line, x: BASH.x, y: BASH.y + 4 + PAPER_LINE_HEIGHT * line - camera.y, height: PAPER_LINE_HEIGHT}));
  return {time, issueStart, narration, subtitleOpacity, phase: zoom > 0 ? 'analysis' as const : 'bash' as const, progress, controls, validation,
    bashAgent, descent, paperHeight: BASH.paperHeight * p.bashExpand, camera, zoom, gridPitch,
    cameraScale, contentScale, contentScreenScale, heroScreenScale, origin, radius, requiredRadius, scanComplete,
    hero: {x: origin.x, y: origin.y, scale: heroScreenScale * (1 - p.analysisAgentScaleOut), angle},
    detectionWarning, warnings, dots, highlightBounds,
  };
}
export type Micro20Sample = ReturnType<typeof sampleMicro20>;
export const sampleMicro20Frame = (frame: number, controls?: Partial<Micro20Controls>, timing?: Partial<PreludeTiming>, issueControls?: Micro15Controls, issueTiming?: Partial<IssueTiming>, issueStart?: number) =>
  sampleMicro20(frame / 30, controls, timing, issueControls, issueTiming, issueStart);
export const radialOrderIsMonotonic = (sample: Extract<Micro20Sample, {phase: 'bash' | 'analysis'}>) => sample.warnings.slice().sort((a, b) => a.distance - b.distance).every((warning, i, warnings) => i === 0 || warnings[i - 1].scale >= warning.scale);
