import { useMemo } from 'react';
import { createSampler, type DialValues } from '../anim/timeline';
import { SPANS, TYPE_COLOR, NEUTRAL, type SpanRow } from './data';

const ROW_H = 38;
const INDENT = 26;

/** Mix two #rrggbb colours in sRGB. Good enough, and identical on both sides. */
const mixHex = (a: string, b: string, t: number) => {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  const ch = (x: number, y: number) =>
    Math.round(x + (y - x) * t)
      .toString(16)
      .padStart(2, '0');
  return `#${ch(r1, r2)}${ch(g1, g2)}${ch(b1, b2)}`;
};

const Icon = ({ type, mix }: { type: SpanRow['type']; mix: number }) => {
  const color = mixHex(NEUTRAL, TYPE_COLOR[type], mix);
  if (type === 'LLM') {
    return (
      <span
        className="inline-block size-2.5 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
    );
  }
  if (type === 'TOOL') {
    return (
      <span
        className="inline-block size-2.5 shrink-0 rotate-45 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
    );
  }
  return (
    <span
      className="inline-block size-2.5 shrink-0 rounded-[2px] opacity-70"
      style={{ backgroundColor: color }}
    />
  );
};

export interface TraceSceneProps {
  /** Seconds. From DialKit's transport when tuning, frame/fps when rendering. */
  t: number;
  /** Tuned overrides from the dock. */
  values?: DialValues;
}

export const TraceScene = ({ t, values }: TraceSceneProps) => {
  const sampler = useMemo(() => createSampler(values ?? {}), [values]);
  const s = sampler.at(t);

  let step = 0;

  return (
    <div className="flex size-full items-center justify-center bg-[#0a0a0a] font-sans">
      <div className="w-[860px] rounded-xl border border-[#2f2f2f] bg-[#121212] p-6 shadow-2xl">
        <div className="mb-5 flex items-baseline justify-between">
          <h1 className="text-[15px] font-medium tracking-tight text-[#e8e6e6]">
            Add pagination to my REST endpoint and test it
          </h1>
          <span className="font-mono text-[11px] text-[#6b7280]">33 spans · 87.4s</span>
        </div>

        <div>
          {SPANS.map((row, i) => {
            const isDefault = row.type === 'DEFAULT';
            if (!isDefault) step += 1;

            // Default rows fade and collapse; everything else holds full height.
            const opacity = isDefault ? s.purge.opacity : 1;
            const squash = isDefault ? s.purge.squash : 1;

            // Tree indent relaxes to a flat list.
            const pad = row.depth * INDENT * s.flatten.indent;

            return (
              <div
                key={i}
                className="overflow-hidden"
                style={{ height: ROW_H * squash, opacity }}
              >
                <div
                  className="flex items-center gap-3 border-b border-[#1e1e1e]"
                  style={{ height: ROW_H, paddingLeft: pad }}
                >
                  <span
                    className="w-5 shrink-0 text-right font-mono text-[11px] text-[#6b7280]"
                    style={{
                      opacity: isDefault ? 0 : s.steps.opacity,
                      transform: `translateY(${s.steps.y}px)`,
                    }}
                  >
                    {isDefault ? '' : step}
                  </span>

                  <Icon type={row.type} mix={s.tint.mix} />

                  <span className="flex-1 truncate font-mono text-[13px] text-[#b5b5b5]">
                    {row.name}
                  </span>

                  <span className="shrink-0 font-mono text-[11px] text-[#6b7280]">
                    {row.dur}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
