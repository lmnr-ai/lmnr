import {clipProgress, type ClipTiming} from '../micro-14/timeline';

export const AGENT_WINDOW = Object.freeze({x: 237, y: -41, width: 807, height: 604});
export const ISSUE_ICON = Object.freeze({width: 42.38583755493164, height: 39.36177444458008});
export const ISSUE_PADDING_LEFT = 12 + ISSUE_ICON.width + 16;
export const PROMPT_PREFIX = 'Use Laminar CLI to investigate\nand fix';
export const ISSUE_TEXT = 'this issue';
export const CLI_COMMAND = 'lmnr-cli sql query';
export const SQL_QUERY = '“SELECT * FROM TRACES WHERE';
export const SQL_PREDICATE_PREFIX = 'arrayExists(';
// One object-replacement character reserves the exact warning-icon position.
export const SQL_PREDICATE = `${SQL_PREDICATE_PREFIX}\uFFFC, clusters)“`;

export const AGENT_TIMING = {
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
} satisfies Record<string, ClipTiming>;
export type AgentTiming = Readonly<Record<keyof typeof AGENT_TIMING, ClipTiming>>;
const smooth = (progress: number) => progress * progress * (3 - 2 * progress);
const end = (clip: ClipTiming) => clip.at + clip.duration;
export const typedText = (text: string, seconds: number, clip: ClipTiming) =>
  text.slice(0, Math.floor(clipProgress(seconds, clip) * text.length + 1e-9));

export function sampleAgentWindow(time: number, timing: AgentTiming = AGENT_TIMING) {
  const seconds = Number.isFinite(time) ? Math.max(0, time) : 0;
  const enter = smooth(clipProgress(seconds, timing.agentWindowEnter));
  const exit = smooth(clipProgress(seconds, timing.agentWindowExit));
  const send = clipProgress(seconds, timing.messageSend);
  const sent = seconds >= end(timing.messageSend);
  const sendProgress = smooth(send);
  // Keep the full message mounted while sending lifts it out of the composer.
  // CLI typing cannot precede send, but retains its full authored duration.
  const afterSend = (clip: ClipTiming): ClipTiming => ({...clip, at: Math.max(clip.at, end(timing.messageSend))});
  const commandTiming = afterSend(timing.cliCommandTyping);
  const queryTiming = afterSend(timing.sqlQueryTyping);
  const predicateTiming = afterSend(timing.sqlPredicateTyping);
  // A newline opens one row, rather than reserving blank rows up front.
  // Cap the expansion at 220ms and within its authored typing clip.
  const lineProgress = (clip: ClipTiming) => sent ? smooth(clipProgress(seconds, {...clip, duration: Math.min(.22, clip.duration)})) : 0;
  const predicate = typedText(SQL_PREDICATE, seconds, predicateTiming);
  const iconCharacter = SQL_PREDICATE_PREFIX.length;
  const iconTypedAt = predicateTiming.at + predicateTiming.duration * (iconCharacter + 1) / SQL_PREDICATE.length;
  const iconTiming = {...timing.queryWarningIn, at: Math.max(timing.queryWarningIn.at, iconTypedAt)};
  const padding = smooth(clipProgress(seconds, timing.issuePadding));
  const phase = exit === 1 ? 'exited' : exit > 0 ? 'exiting' : enter === 0 ? 'hidden' : enter < 1 ? 'entering' : sent ? 'sent' : send > 0 ? 'sending' : 'composing';
  return Object.freeze({
    phase, visible: enter > 0 && exit < 1,
    translateY: AGENT_WINDOW.height * (enter - 1 - exit),
    prompt: typedText(PROMPT_PREFIX, seconds, timing.promptTyping),
    issue: typedText(ISSUE_TEXT, seconds, timing.issueTyping),
    issuePaddingLeft: ISSUE_PADDING_LEFT * padding, issuePaddingRight: 12 * padding,
    issueBackground: smooth(clipProgress(seconds, timing.issueBackground)),
    issueWarningScale: smooth(clipProgress(seconds, timing.issueWarningIn)),
    sendProgress, sent,
    lines: Object.freeze({command: lineProgress(commandTiming), query: lineProgress(queryTiming), predicate: lineProgress(predicateTiming)}),
    command: sent ? typedText(CLI_COMMAND, seconds, commandTiming) : '',
    query: sent ? typedText(SQL_QUERY, seconds, queryTiming) : '',
    predicatePrefix: sent ? predicate.slice(0, iconCharacter) : '',
    predicateSuffix: sent ? predicate.slice(iconCharacter + 1) : '',
    queryWarningScale: sent && predicate.length > iconCharacter ? smooth(clipProgress(seconds, iconTiming)) : 0,
  });
}
export type AgentWindowSample = ReturnType<typeof sampleAgentWindow>;
