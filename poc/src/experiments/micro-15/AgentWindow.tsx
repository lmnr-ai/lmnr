import {staticFile} from 'remotion';
import {AGENT_WINDOW, ISSUE_ICON, ISSUE_PADDING_LEFT, ISSUE_TEXT, PROMPT_PREFIX, type AgentWindowSample} from './agent-window';

const Warning = ({scale, className = ''}: {scale: number; className?: string}) => <img
  className={`micro15-agent-warning ${className}`} src={staticFile('micro-15/issue-warning.svg')} alt=""
  style={{width: ISSUE_ICON.width, height: ISSUE_ICON.height, transform: `scale(${scale})`}}/>;

const IssueReference = ({sample, sent}: {sample: AgentWindowSample; sent: boolean}) => <span
  className="micro15-issue-reference" data-issue-reference={sent ? 'sent' : 'composer'}
  style={{paddingLeft: sent ? ISSUE_PADDING_LEFT : sample.issuePaddingLeft,
    paddingRight: sent ? 12 : sample.issuePaddingRight,
    backgroundColor: sent ? '#333333' : `rgba(${71 - 20 * sample.sendProgress}, ${71 - 20 * sample.sendProgress}, ${71 - 20 * sample.sendProgress}, ${sample.issueBackground})`}}>
  <Warning className="micro15-issue-icon" scale={sent ? 1 : sample.issueWarningScale}/>
  <span data-issue-text>{sent ? ISSUE_TEXT : sample.issue}</span>
</span>;

const Prompt = ({sample, sent = false}: {sample: AgentWindowSample; sent?: boolean}) => {
  const [first = '', second = ''] = (sent ? PROMPT_PREFIX : sample.prompt).split('\n');
  return <>
    <div className="micro15-agent-line" data-prompt-first>{first}</div>
    <div className="micro15-agent-line micro15-prompt-second">
      <span data-prompt-second>{second}</span><IssueReference sample={sample} sent={sent}/>
    </div>
  </>;
};

export const AgentWindow = ({sample}: {sample: AgentWindowSample}) => <svg
  className="micro15-agent-overlay" viewBox="0 0 1280 720" aria-label="Coding agent investigates the issue"
  data-agent-phase={sample.phase} style={{visibility: sample.visible ? 'visible' : 'hidden'}}>
  <foreignObject x={AGENT_WINDOW.x} y={AGENT_WINDOW.y} width={AGENT_WINDOW.width} height={AGENT_WINDOW.height}
    transform={`translate(0 ${sample.translateY})`}>
    <div className="micro15-agent-window" data-agent-window>
      <div className="micro15-agent-empty-composer" style={{top: 371 + 58 * sample.sendProgress, height: 157 - 58 * sample.sendProgress}}/>
      <div className="micro15-agent-transcript" data-agent-transcript
        style={{bottom: 96 + 79 * sample.sendProgress, paddingBottom: 40 * sample.sendProgress}}>
        <div className="micro15-sent-message" data-user-message={sample.sent ? '' : undefined}
          data-agent-composer={sample.sent ? undefined : ''}
          style={{color: `rgb(${255 - 127 * sample.sendProgress}, ${255 - 127 * sample.sendProgress}, ${255 - 127 * sample.sendProgress})`}}>
          <Prompt sample={sample} sent={sample.sent}/>
        </div>
        <div className="micro15-agent-cli" data-cli-output
          style={{marginTop: 40 * Math.max(sample.lines.command, sample.lines.query, sample.lines.predicate)}}>
          <div className="micro15-cli-row" style={{height: 58 * sample.lines.command}}>
            <div className="micro15-agent-line micro15-agent-muted" data-cli-command>{sample.command}</div>
          </div>
          <div className="micro15-cli-row" style={{height: 58 * sample.lines.query}}>
            <div className="micro15-agent-line" data-sql-query>
              <span className="micro15-agent-muted">{sample.query.slice(0, 1)}</span>{sample.query.slice(1)}
            </div>
          </div>
          <div className="micro15-cli-row" style={{height: 58 * sample.lines.predicate}}>
            <div className="micro15-agent-line micro15-predicate" data-sql-predicate>
              <span className="micro15-predicate-prefix">{sample.predicatePrefix}</span>
              <Warning scale={sample.queryWarningScale}/>
              <span>{sample.predicateSuffix.replace(/“$/, '')}</span>
              <span className="micro15-agent-muted">{sample.predicateSuffix.endsWith('“') ? '“' : ''}</span>
            </div>
          </div>
        </div>
      </div>
      <footer className="micro15-agent-footer"><span>fix/my-agent</span><span>claude-opus-5.5</span></footer>
    </div>
  </foreignObject>
</svg>;
