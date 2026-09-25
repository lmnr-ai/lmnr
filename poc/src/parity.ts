/**
 * Proves the claim this POC exists to test: DialKit's timeline core is a pure
 * function of time, so the DialKit dock and Remotion's frame clock produce
 * identical values.
 *
 * Run with `npm run parity`. No browser, no React, no clock.
 */
import { createSampler } from './anim/timeline';
import tuned from '../tuned.json';

const FPS = 60;

const tuning = createSampler(tuned);
const render = createSampler(tuned);

console.log(`timeline duration: ${tuning.duration}s -> ${Math.ceil(tuning.duration * FPS)} frames @ ${FPS}fps\n`);

const fmt = (n: number) => n.toFixed(4).padStart(8);
let mismatches = 0;

console.log('frame      t   purge.op  purge.sq    indent       mix   steps.y');
console.log('─'.repeat(68));

for (let frame = 0; frame <= Math.ceil(tuning.duration * FPS); frame += 15) {
  const t = frame / FPS;

  // Remotion drives from the frame number; the dock drives from wall time.
  const a = render.at(t);
  const b = tuning.at(t);

  if (JSON.stringify(a) !== JSON.stringify(b)) mismatches += 1;

  console.log(
    `${String(frame).padStart(5)} ${t.toFixed(3).padStart(6)}` +
      `${fmt(a.purge.opacity)}${fmt(a.purge.squash)}` +
      `${fmt(a.flatten.indent)}${fmt(a.tint.mix)}${fmt(a.steps.y)}`,
  );
}

console.log('─'.repeat(68));

// Determinism: re-sampling the same frame must not drift.
const spot = 0.75;
const repeats = new Set(
  Array.from({ length: 50 }, () => JSON.stringify(createSampler(tuned).at(spot))),
);

console.log(`\nparity mismatches across drivers : ${mismatches}`);
console.log(`distinct results for 50 samplers at t=${spot}s : ${repeats.size}`);

if (mismatches > 0 || repeats.size !== 1) {
  console.error('\nFAIL — the two drivers disagree, or sampling is not deterministic.');
  process.exit(1);
}
console.log('\nPASS — identical and deterministic. Safe to render.');
