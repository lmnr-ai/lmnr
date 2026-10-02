import {PAPER_LINES, PAPER_ADVANCE, PAPER_LINE_HEIGHT, HIGHLIGHT_PHRASE} from '../micro-07/paper';

// Animation 12’s exact paper copy/layout and red highlight; Animation 7’s fixed door viewport.
export const Paper = ({x, width, kind, progress, highlight}: {x: number; width: number; kind: string; progress: number; highlight: number}) => {
  const copy = kind === 'read'
    ? 'src/main.tsx\nApp mounts in StrictMode. No CSS inspected. No browser verification recorded.'
    : 'The entry point looks fine. I’ll run the linter to narrow this down. If it passes, I’ll inspect the component that renders this view.';
  return <foreignObject x={x} y={-60} width={width} height={260} style={{overflow: 'hidden', clipPath: `inset(${120 * (1 - progress)}px 0 0 0)`}}>
    <div className="micro17-paper" style={{width, whiteSpace: kind === 'thinking-blue' ? 'normal' : 'pre-line', transform: `translateY(${(120 - 260) * (1 - progress)}px)`}}>
      {kind !== 'thinking-blue' ? copy : PAPER_LINES.map((line, index) => {
        const fragment = line.highlight;
        const amount = fragment ? Math.max(0, Math.min(1, (highlight * HIGHLIGHT_PHRASE.length - fragment.offset) / fragment.length)) : 0;
        return <div key={index} className="micro17-paper-line" style={{lineHeight: `${PAPER_LINE_HEIGHT}px`}}>{line.text}{fragment && <span aria-hidden="true" className="micro17-highlight" style={{left: fragment.column * PAPER_ADVANCE - 2, top: -2, width: fragment.length * PAPER_ADVANCE + 4, padding: 2, clipPath: `inset(0 ${100 * (1 - amount)}% 0 0)`}}>{fragment.text}</span>}</div>;
      })}
    </div>
  </foreignObject>;
};
