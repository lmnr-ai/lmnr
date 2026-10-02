import {staticFile} from 'remotion';
import {Micro20Scene} from '../micro-20/Scene';
import {ASSETS} from '../micro-16/geometry';
import {OUTRO_TEXT} from '../micro-20/outro';
import {unit} from '../micro-20/timeline';
import {PAPER_LINES, HIGHLIGHT_LINES} from './paper';
import {NARRATION} from './narration';
import {REPORT_EXPLANATION, REPORT_FIELDS, type Micro22Sample} from './sample';
export const Micro22Subtitles = ({sample}: {sample: Micro22Sample}) => <div className="micro20-subtitle-layer"><div className="micro20-subtitle" style={{opacity: sample.outro ? 1 : sample.subtitleOpacity}}>{sample.outro ? OUTRO_TEXT : sample.narration ? NARRATION[sample.narration] : ''}</div></div>;
export function Micro22Scene({sample: s, sharedEntry = false, showSubtitles = true}: {sample: Micro22Sample; sharedEntry?: boolean; showSubtitles?: boolean}) {
  const r = s.report, l = unit(s.progress.labels), e = unit(s.progress.explanation);
  const words = REPORT_EXPLANATION.split(' '), visibleWords = words.slice(0, r.explanationWords).join(' ');
  const remainingWords = words.slice(r.explanationWords).join(' ');
  // The report lives on the same trace plane as Bash and the agent, so the
  // pullback shrinks all three together. Its center never moves during growth.
  const report = s.world.phase === 'issues' ? undefined : <g data-issue-report-plane transform={`scale(${s.world.contentScale}) translate(-746 -360)`}>
    <foreignObject x={r.x} y={r.y} width={r.width + 44} height={r.height} style={{overflow: 'visible'}}>
      <div className="micro22-report" data-report-state={e > 0 ? 'explanation' : l > 0 ? 'labels' : 'compact'} style={{width: r.width, height: r.height, transform: `scale(${r.scale})`, visibility: r.scale === 0 ? 'hidden' : undefined}}>
        <img alt="Issue detected" className="micro22-report-warning" src={staticFile(`micro-16/${ASSETS.warning}`)} style={{transform: `translate(-50%, -50%) scale(${r.warningScale})`}}/>
        <div className="micro22-report-content">
          {REPORT_FIELDS.map((field, index) => <div className="micro22-report-row" key={field.name} style={{opacity: r.rows[index].opacity, transform: `translateY(${r.rows[index].y}px)`}}><span>{field.name}</span><span data-report-chip={field.name} style={{background: field.color}}>{field.value}</span></div>)}
          <div className="micro22-explanation"><div style={{opacity: e}}>explanation</div><p data-visible-words={r.explanationWords}>{visibleWords}{visibleWords && remainingWords ? ' ' : ''}<span style={{visibility: 'hidden'}}>{remainingWords}</span></p></div>
        </div>
        <svg className="micro22-report-tail" viewBox="0 0 44 51" aria-hidden="true"><path d="M0 0L36 25.5L0 51Z" fill="white"/></svg>
      </div>
    </foreignObject>
  </g>;
  return <div className="micro22-composition" data-source-version="22" data-time={s.time} style={sharedEntry ? {background: 'transparent', overflow: 'visible'} : undefined}>
    <Micro20Scene sample={s.world} sharedEntry={sharedEntry} extendSharedEntry={sharedEntry} showSubtitles={false} traceContent={{lines: PAPER_LINES, highlights: HIGHLIGHT_LINES}} report={report}/>
    {showSubtitles && !sharedEntry && <Micro22Subtitles sample={s}/>}
  </div>;
}
