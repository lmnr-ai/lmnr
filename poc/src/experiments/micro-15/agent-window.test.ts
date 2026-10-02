import assert from 'node:assert/strict';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {readFileSync} from 'node:fs';
import {AgentWindow} from './AgentWindow';
import {AGENT_TIMING, AGENT_WINDOW, CLI_COMMAND, ISSUE_PADDING_LEFT, ISSUE_TEXT, PROMPT_PREFIX, SQL_PREDICATE, SQL_QUERY, sampleAgentWindow, typedText} from './agent-window';
import {sampleMicro15, sampleMicro15Frame} from './sample';
import {MICRO_15_DEFAULTS, MICRO_15_TIMING, normalizeMicro15Timing} from './timeline';
import {CONTROLS_KEY, OLD_CONTROLS_KEY, migrateAgentControls} from './persistence';

assert.deepEqual(AGENT_TIMING, {
  agentWindowEnter: {at: 4.26, duration: .47},
  promptTyping: {at: 4.27, duration: .44},
  issueTyping: {at: 4.64, duration: .27},
  issuePadding: {at: 4.65, duration: .35},
  issueBackground: {at: 4.64, duration: .2},
  issueWarningIn: {at: 4.79, duration: .3},
  messageSend: {at: 5.08, duration: .18},
  cliCommandTyping: {at: 5.21, duration: .33},
  sqlQueryTyping: {at: 5.46, duration: .23},
  sqlPredicateTyping: {at: 5.63, duration: .27},
  queryWarningIn: {at: 5.72, duration: .2},
  agentWindowExit: {at: 6.62, duration: .38},
}, 'code defaults match the approved DialKit master timeline');
assert.equal(MICRO_15_DEFAULTS.timelineDuration, 7, 'export and soundtrack end exactly with the final 7s exit');
assert.deepEqual(AGENT_WINDOW, {x: 237, y: -41, width: 807, height: 604}, 'exact Figma window geometry, including the intentional top crop');
assert.equal(sampleAgentWindow(0).visible, false);
assert.equal(sampleAgentWindow(AGENT_TIMING.agentWindowEnter.at).translateY, -604);
assert.ok(Math.abs(sampleAgentWindow(AGENT_TIMING.agentWindowEnter.at + AGENT_TIMING.agentWindowEnter.duration / 2).translateY + 302) < 1e-8);
assert.equal(sampleAgentWindow(AGENT_TIMING.agentWindowEnter.at + AGENT_TIMING.agentWindowEnter.duration).translateY, 0);
assert.equal(sampleAgentWindow(AGENT_TIMING.agentWindowExit.at + AGENT_TIMING.agentWindowExit.duration).visible, false);
assert.equal(sampleAgentWindow(AGENT_TIMING.agentWindowExit.at + AGENT_TIMING.agentWindowExit.duration).translateY, -604);
assert.ok(sampleAgentWindow(AGENT_TIMING.agentWindowExit.at + AGENT_TIMING.agentWindowExit.duration / 2).visible);
for (const [text, clip] of [[PROMPT_PREFIX, AGENT_TIMING.promptTyping], [ISSUE_TEXT, AGENT_TIMING.issueTyping],
  [CLI_COMMAND, AGENT_TIMING.cliCommandTyping], [SQL_QUERY, AGENT_TIMING.sqlQueryTyping],
  [SQL_PREDICATE, AGENT_TIMING.sqlPredicateTyping]] as const) {
  assert.equal(typedText(text, clip.at - .01, clip), '');
  for (let length = 0; length <= text.length; length++) {
    assert.equal(typedText(text, clip.at + clip.duration * length / text.length, clip), text.slice(0, length), 'letter-by-letter progression');
  }
}
const composed = sampleAgentWindow(5);
assert.equal(composed.prompt, PROMPT_PREFIX);
assert.equal(composed.issue, ISSUE_TEXT);
assert.equal(composed.issuePaddingLeft, ISSUE_PADDING_LEFT);
assert.equal(composed.issuePaddingRight, 12);
assert.equal(composed.issueBackground, 1);
assert.ok(composed.issueWarningScale > 0 && composed.issueWarningScale < 1, 'warning continues scaling until 5.09s, overlapping the send start');
assert.equal(composed.sent, false);
assert.equal(sampleAgentWindow(5.259).sent, false);
assert.equal(sampleAgentWindow(5.26).sent, true, 'send completion marks the already-mounted message as sent');
const messageTop = (time: number) => {
  const state = sampleAgentWindow(time);
  return 392 - 119 * state.sendProgress - 58 * (state.lines.command + state.lines.query + state.lines.predicate)
    - 40 * Math.max(state.lines.command, state.lines.query, state.lines.predicate);
};
assert.equal(messageTop(5), 392, 'composer text retains its original position');
assert.ok(Math.abs(messageTop(5.17) - 332.5) < 1e-8, 'send lifts the same message smoothly halfway');
assert.ok(Math.abs(messageTop(5.26) - 273) < 1e-8, 'sent message starts at the bottom, without empty CLI rows');
assert.equal(messageTop(6), 59, 'complete transcript matches revised Figma y=59, 40px gap and bottom padding');
for (const clip of [AGENT_TIMING.messageSend, AGENT_TIMING.cliCommandTyping, AGENT_TIMING.sqlQueryTyping, AGENT_TIMING.sqlPredicateTyping]) {
  for (const boundary of [clip.at, clip.at + Math.min(.22, clip.duration)]) {
    assert.ok(Math.abs(messageTop(boundary + 1e-6) - messageTop(boundary - 1e-6)) < .01, 'no positional jumps at send/newline boundaries');
  }
}
assert.deepEqual(sampleAgentWindow(5.26).lines, {command: 0, query: 0, predicate: 0}, 'no preallocated CLI lines');
assert.deepEqual(sampleAgentWindow(6).lines, {command: 1, query: 1, predicate: 1});
const transcript = sampleAgentWindow(6);
assert.equal(transcript.command, CLI_COMMAND);
assert.equal(transcript.query, SQL_QUERY);
assert.equal(transcript.predicatePrefix + '\uFFFC' + transcript.predicateSuffix, SQL_PREDICATE);
assert.equal(transcript.queryWarningScale, 1);
assert.equal(sampleAgentWindow(5.26).command, '', 'the CLI does not appear fully formed with the user message');
assert.equal(sampleAgentWindow(5.425).command, CLI_COMMAND.slice(0, Math.floor(CLI_COMMAND.length / 2)));
const sample = sampleAgentWindow(4.95);
const paddingOnly = sampleAgentWindow(4.95, {...AGENT_TIMING, issuePadding: {at: 12, duration: .35}});
assert.equal(paddingOnly.issuePaddingLeft, 0);
assert.equal(paddingOnly.issueBackground, sample.issueBackground);
assert.equal(paddingOnly.issueWarningScale, sample.issueWarningScale);
const backgroundOnly = sampleAgentWindow(4.95, {...AGENT_TIMING, issueBackground: {at: 12, duration: .35}});
assert.equal(backgroundOnly.issueBackground, 0);
assert.equal(backgroundOnly.issuePaddingLeft, sample.issuePaddingLeft);
const iconOnly = sampleAgentWindow(4.95, {...AGENT_TIMING, issueWarningIn: {at: 12, duration: .3}});
assert.equal(iconOnly.issueWarningScale, 0);
assert.equal(iconOnly.issueBackground, sample.issueBackground);
const delayedSend = {...AGENT_TIMING, messageSend: {at: 20, duration: 1}};
assert.equal(sampleAgentWindow(20.99, delayedSend).command, '');
assert.equal(sampleAgentWindow(21, delayedSend).command, '');
assert.deepEqual(sampleAgentWindow(21, delayedSend).lines, {command: 0, query: 0, predicate: 0}, 'line expansion respects a delayed send');
assert.equal(sampleAgentWindow(21.91, delayedSend).command, CLI_COMMAND, 'CLI gets a full duration after a delayed send');
const instant = Object.fromEntries(Object.keys(AGENT_TIMING).map(key => [key, {at: 0, duration: 0}])) as typeof AGENT_TIMING;
assert.equal(sampleAgentWindow(0, instant).phase, 'exited');
assert.equal(sampleAgentWindow(0, instant).command, CLI_COMMAND);
assert.equal(sampleAgentWindow(0, instant).issueWarningScale, 1);
sampleAgentWindow(7); sampleAgentWindow(0); sampleAgentWindow(4);
assert.deepEqual(sampleAgentWindow(4.95), sample, 'arbitrary seeking is deterministic');
assert.deepEqual(sampleAgentWindow(Number.NaN), sampleAgentWindow(0));
const oldTiming = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(MICRO_15_TIMING).filter(([key]) => !(key in AGENT_TIMING)))));
assert.deepEqual(normalizeMicro15Timing(oldTiming), MICRO_15_TIMING, 'old saved timelines acquire missing agent tracks without losing tuned clips');
const grid = (time: number) => {
  const {tokens, groundDots, clusters} = sampleMicro15(time, MICRO_15_DEFAULTS);
  return {tokens, groundDots, clusters};
};
for (const time of [6, 6.5, 7]) assert.deepEqual(grid(time), grid(6), 'original final grid remains untouched below the overlay and after exit');
assert.deepEqual(sampleMicro15Frame(180, MICRO_15_DEFAULTS), sampleMicro15(6, MICRO_15_DEFAULTS), 'editor/export parity includes agent state');
const promptMarkup = renderToStaticMarkup(createElement(AgentWindow, {sample: composed}));
assert.ok(promptMarkup.includes('data-issue-reference="composer"'));
assert.ok(promptMarkup.includes(`padding-left:${ISSUE_PADDING_LEFT}px`));
assert.ok(promptMarkup.includes('this issue'));
assert.ok(!promptMarkup.includes('data-user-message'));
const sentMarkup = renderToStaticMarkup(createElement(AgentWindow, {sample: sampleAgentWindow(5.26)}));
assert.ok(sentMarkup.includes('data-user-message') && sentMarkup.includes('this issue'));
assert.ok(!sentMarkup.includes('data-agent-composer'));
assert.ok(!sentMarkup.includes(CLI_COMMAND), 'sent user message appears instantly but command starts empty');
assert.ok(readFileSync('public/micro-15/issue-warning.svg', 'utf8').includes('#4685E7'), 'exact blue Figma warning is local');

const entries = new Map<string, string>();
const storage = {getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => {entries.set(key, value);}};
const saved = {version: 1, values: {travelDuration: .65, warningAppearanceDuration: .15, timelineDuration: 5.7},
  baseValues: {travelDuration: .7, timelineDuration: 5.7}, activePresetId: 'custom',
  presets: [{id: 'custom', name: 'Keep me', values: {travelDuration: .65, timelineDuration: 5.7}}]};
storage.setItem(OLD_CONTROLS_KEY, JSON.stringify(saved));
migrateAgentControls(storage);
const migrated = JSON.parse(storage.getItem(CONTROLS_KEY)!);
assert.equal(migrated.values.travelDuration, .65);
assert.equal(migrated.values.warningAppearanceDuration, .15);
assert.equal(migrated.values.timelineDuration, 7);
assert.equal(migrated.baseValues.travelDuration, .7);
assert.equal(migrated.presets[0].values.timelineDuration, 7);
assert.equal(migrated.activePresetId, 'custom');
assert.equal(storage.getItem(OLD_CONTROLS_KEY), JSON.stringify(saved), 'old storage is not destroyed');
migrated.values.timelineDuration = 12;
storage.setItem(CONTROLS_KEY, JSON.stringify(migrated));
migrateAgentControls(storage);
assert.equal(JSON.parse(storage.getItem(CONTROLS_KEY)!).values.timelineDuration, 12, 'later authoring edits are not overwritten');
entries.delete(CONTROLS_KEY);
storage.setItem(OLD_CONTROLS_KEY, '{broken');
migrateAgentControls(storage);
assert.equal(storage.getItem(CONTROLS_KEY), null);
console.log('Micro15 agent: Figma geometry/assets, character typing, independent badge tracks, smooth send/newline layout, CLI gating, entry/exit, preserved grid, seek/export parity, and saved-setting migration passed.');
