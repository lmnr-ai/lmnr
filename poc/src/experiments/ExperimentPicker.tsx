const EXPERIMENTS = [
  {id: 'micro-01', label: 'Animation 1 — Path comets'},
  {id: 'micro-02', label: 'Animation 2 — Signals'},
  {id: 'micro-03', label: 'Animation 3 — Flow'},
  {id: 'micro-04', label: 'Animation 4 — Thinking'},
  {id: 'micro-05', label: 'Animation 5 — Heerich grid'},
  {id: 'micro-06', label: 'Animation 6 — Snail'},
  {id: 'micro-07', label: 'Animation 7 — Snail straight'},
  {id: 'micro-08', label: 'Animation 8 — Infinite streamers'},
  {id: 'micro-09', label: 'Animation 9 — Cloud reveal'},
  {id: 'micro-10', label: 'Animation 10 — Cloud streamer'},
  {id: 'micro-11', label: 'Animation 11 — Streamer only'},
  {id: 'micro-12', label: 'Animation 12 — Ultimate'},
  {id: 'introducing-flow-1', label: 'Animation 13 - Introducing Flow-1'},
  {id: 'micro-14', label: 'Animation 14 — Issue clusters'},
  {id: 'micro-15', label: 'Animation 15 — ISSUE CLUSTERS 2'},
  {id: 'micro-16', label: 'Animation 16 — Cost of a trace'},
  {id: 'micro-17', label: 'Animation 17 — Ultimate 2'},
  {id: 'micro-18', label: 'Animation 18 — Ultimate 3'},
  {id: 'ultimate-3-silk', label: 'Animation 19 - Ultimate 3 — Silk sound design'},
  {id: 'micro-20', label: 'Animation 20 - Issue clusters 3'},
] as const;

export const ExperimentPicker = ({current}: {current: string}) => (
  <select
    className="experiment-picker"
    aria-label="Select animation"
    value={current}
    onChange={(event) => {
      const url = new URL(window.location.href);
      url.searchParams.set('experiment', event.currentTarget.value);
      window.location.assign(url);
    }}
  >
    {EXPERIMENTS.map(({id, label}) => (
      <option key={id} value={id}>{label}</option>
    ))}
  </select>
);
