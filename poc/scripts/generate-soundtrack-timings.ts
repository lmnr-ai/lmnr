import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {MICRO_10_TIMELINE} from '../src/experiments/micro-10/timeline';
import {AGENT, CELL, MICRO_10_DEFAULTS, STREAM_PERIOD, STREAM_SEGMENTS, sampleMicro10} from '../src/experiments/micro-10/geometry';
import {INTRODUCING_FLOW_1_TIMELINE} from '../src/experiments/introducing-flow-1/timeline';
import {LINE_PITCH, sampleFlowDots} from '../src/experiments/introducing-flow-1/geometry';
import {SPARKLE_DEFAULTS} from '../src/experiments/micro-09/sparkle';
import {warningAppearanceTiming} from '../src/experiments/micro-14/appearance';
import {CLUSTERS, TOKENS} from '../src/experiments/micro-14/geometry';
import {MICRO_15_DEFAULTS, MICRO_15_TIMING} from '../src/experiments/micro-15/timeline';
import {APPEARANCE_SEED, START_CELLS} from '../src/experiments/micro-15/starting-positions';
import {travelTimingForCell} from '../src/experiments/micro-15/travel';
import {CLI_COMMAND, ISSUE_TEXT, PROMPT_PREFIX, SQL_PREDICATE, SQL_PREDICATE_PREFIX, SQL_QUERY} from '../src/experiments/micro-15/agent-window';

const FPS = 30;
const round = (value: number) => Number(value.toFixed(6));
const authoredClip = (clip: {at: number; duration: number}) => ({
  time: round(clip.at),
  duration: round(clip.duration),
  end: round(clip.at + clip.duration),
});

function animation10() {
  const duration = MICRO_10_TIMELINE.duration;
  const speed = MICRO_10_DEFAULTS.streamerSpeed;
  const cycleDuration = STREAM_PERIOD / speed;
  const entrances: Array<{time: number; name: string}> = [];
  const exits: Array<{time: number; name: string}> = [];
  for (let cycle = 0; cycle * cycleDuration < duration; cycle++) {
    for (const segment of STREAM_SEGMENTS) {
      const rawEntrance = cycle * cycleDuration + segment.start / speed;
      if (rawEntrance < duration) entrances.push({time: round(rawEntrance), name: segment.name});
      const initialRight = AGENT.x - STREAM_PERIOD + segment.start + segment.width;
      const rawExit = (initialRight + cycle * STREAM_PERIOD) / speed;
      if (rawExit >= 0 && rawExit < duration) exits.push({time: round(rawExit), name: segment.name});
    }
  }
  const puffPeriod = Math.max(.01, MICRO_10_TIMELINE.puffs.duration);
  const puffs = [];
  for (let raw = MICRO_10_TIMELINE.puffs.at; raw < duration; raw += puffPeriod) puffs.push({time: round(raw)});
  const rotationPeriod = 1 / MICRO_10_DEFAULTS.loaderSpeed;
  const spinner = [];
  for (let turn = 5; turn * rotationPeriod < duration; turn += 5) spinner.push({time: round(turn * rotationPeriod), turn});
  const gridPeriod = CELL / speed;
  const grid = [];
  for (let raw = gridPeriod; raw < duration; raw += gridPeriod) grid.push({time: round(raw)});
  // Exercise the same sampler used by the video export at the final frame.
  sampleMicro10((duration * FPS - 1) / FPS, MICRO_10_DEFAULTS, MICRO_10_TIMELINE.puffs);
  return {duration, clock: MICRO_10_TIMELINE.clock, entrances, exits, puffs, spinner, grid};
}

function animation13() {
  const duration = INTRODUCING_FLOW_1_TIMELINE.duration;
  const clips = Object.fromEntries(Object.entries(INTRODUCING_FLOW_1_TIMELINE)
    .filter(([key]) => key !== 'duration')
    .map(([key, clip]) => [key, authoredClip(clip as {at: number; duration: number})]));
  const dots = [];
  let previous = sampleFlowDots(0).map(dot => dot.colored);
  const dotsEnd = (INTRODUCING_FLOW_1_TIMELINE.dotsExit.at + INTRODUCING_FLOW_1_TIMELINE.dotsExit.duration);
  for (let tick = 1; tick / SPARKLE_DEFAULTS.clockFrequency < dotsEnd; tick++) {
    const raw = tick / SPARKLE_DEFAULTS.clockFrequency;
    const current = sampleFlowDots(raw).map(dot => dot.colored);
    const count = current.reduce((total, value, index) => total + Number(value !== previous[index]), 0);
    dots.push({time: round(raw), count, tick});
    previous = current;
  }
  const loop = (start: number, period: number) => {
    const result = [];
    for (let turn = 1; start + turn * period < duration; turn++) result.push({time: round(start + turn * period), turn});
    return result;
  };
  return {
    duration,
    clips,
    dots,
    engineSpinnerWraps: loop(INTRODUCING_FLOW_1_TIMELINE.engineSpinner.at, 3),
    engineLineWraps: loop(INTRODUCING_FLOW_1_TIMELINE.engineLines.at, LINE_PITCH / 48),
    coverSpinnerWraps: loop(INTRODUCING_FLOW_1_TIMELINE.coverSpinner.at, INTRODUCING_FLOW_1_TIMELINE.coverSpinner.duration),
  };
}

function animation15() {
  const duration = MICRO_15_DEFAULTS.timelineDuration;
  const warningTokens = TOKENS.filter(token => token.kind === 'warning');
  const appearanceTimings = warningTokens.map(token => warningAppearanceTiming(
    APPEARANCE_SEED,
    START_CELLS[token.id],
    MICRO_15_TIMING.appearance,
    MICRO_15_DEFAULTS.warningAppearanceDuration,
  ));
  const travelTimings = warningTokens.map(token => travelTimingForCell(
    START_CELLS[token.id],
    MICRO_15_TIMING.travelStart,
    MICRO_15_DEFAULTS.travelDuration,
  ));
  const appearances = warningTokens.map((token, index) => ({id: token.id, ...authoredClip(appearanceTimings[index])})).sort((a, b) => a.time - b.time);
  const travelStarts = warningTokens.map((token, index) => ({id: token.id, ...authoredClip(travelTimings[index])})).sort((a, b) => a.time - b.time);
  const clusterEffects = CLUSTERS.flatMap(cluster => {
    const members = warningTokens.map((token, index) => ({token, appearance: appearanceTimings[index], travel: travelTimings[index]})).filter(item => item.token.clusterId === cluster.id);
    const readyAt = Math.max(...members.flatMap(item => [item.appearance.at + item.appearance.duration, item.travel.at + item.travel.duration]));
    return (['triangleScaleOut', 'coverAppearance', 'triangleScaleIn'] as const).map(track => {
      const clip = MICRO_15_TIMING[track];
      return {cluster: cluster.id, effect: track, ...authoredClip({at: Math.max(readyAt, clip.at), duration: clip.duration})};
    });
  });
  const sendEnd = MICRO_15_TIMING.messageSend.at + MICRO_15_TIMING.messageSend.duration;
  const effectiveTypingClip = (key: 'promptTyping'|'issueTyping'|'cliCommandTyping'|'sqlQueryTyping'|'sqlPredicateTyping') => {
    const clip = MICRO_15_TIMING[key];
    return key === 'promptTyping' || key === 'issueTyping' ? clip : {...clip, at: Math.max(clip.at, sendEnd)};
  };
  const characterTimes = (text: string, clip: {at: number; duration: number}) => Array.from({length: text.length}, (_, index) => ({
    time: round(clip.at + clip.duration * (index + 1) / text.length),
    character: text[index],
    index: index + 1,
  }));
  const typingClips = {
    prompt: effectiveTypingClip('promptTyping'),
    issue: effectiveTypingClip('issueTyping'),
    command: effectiveTypingClip('cliCommandTyping'),
    query: effectiveTypingClip('sqlQueryTyping'),
    predicate: effectiveTypingClip('sqlPredicateTyping'),
  };
  const typing = {
    prompt: characterTimes(PROMPT_PREFIX, typingClips.prompt),
    issue: characterTimes(ISSUE_TEXT, typingClips.issue),
    command: characterTimes(CLI_COMMAND, typingClips.command),
    query: characterTimes(SQL_QUERY, typingClips.query),
    predicate: characterTimes(SQL_PREDICATE, typingClips.predicate),
  };
  const rows = Object.fromEntries((['command','query','predicate'] as const).map(key => {
    const clip = typingClips[key];
    return [key, authoredClip({at: clip.at, duration: Math.min(.22, clip.duration)})];
  }));
  const iconCharacter = SQL_PREDICATE_PREFIX.length;
  const iconTypedAt = typingClips.predicate.at + typingClips.predicate.duration * (iconCharacter + 1) / SQL_PREDICATE.length;
  const queryWarningAt = Math.max(MICRO_15_TIMING.queryWarningIn.at, iconTypedAt);
  return {
    duration,
    controls: MICRO_15_DEFAULTS,
    clips: Object.fromEntries(Object.entries(MICRO_15_TIMING).map(([key, clip]) => [key, authoredClip(clip)])),
    appearances,
    travelStarts,
    clusterEffects,
    typing,
    rows,
    queryWarning: authoredClip({at: queryWarningAt, duration: MICRO_15_TIMING.queryWarningIn.duration}),
  };
}

const manifest = {schema: 'signal-soundtrack-timing/v1', fps: FPS, animation10: animation10(), animation13: animation13(), animation15: animation15()};
const output = `// Generated from the DialKit timelines and deterministic video samplers. Do not edit.\nwindow.SOUNDTRACK_TIMINGS = ${JSON.stringify(manifest, null, 2)};\n`;
const here = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(here, '../../soundscape-prototype/studies/timings.generated.js');
if (process.argv.includes('--check')) {
  if (!fs.existsSync(outputPath) || fs.readFileSync(outputPath, 'utf8') !== output) {
    console.error(`Generated timing manifest is stale. Run: pnpm --dir poc exec tsx scripts/generate-soundtrack-timings.ts`);
    process.exit(1);
  }
} else {
  fs.writeFileSync(outputPath, output);
  console.log(`Wrote ${outputPath}`);
}
