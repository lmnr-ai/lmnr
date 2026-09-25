import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {sampleMicro08} from './sample';
import {OTHER_DOTS, dotFill, gridDotPose, rowPose} from './outro';

// Optional explicit browser check. Not part of the low-CPU Node test suite.
const base = process.env.PREVIEW_URL ?? 'http://localhost:3002';
const session = ['--session', 'micro08-tests'];
const run = (...args: string[]) => execFileSync('agent-browser', [...session, ...args], {encoding: 'utf8', timeout: 30_000});
const evaluate = <T>(js: string): T => JSON.parse(run('eval', js));
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < .001, `${a} != ${b}`);
type Snapshot = {
  heads: {transform: string; radius: number; width: number; stroke: number; fill: string}[];
  strips: {x: number; width: number; height: number; opacity: number}[];
  dots: {x: number; y: number; radius: number; opacity: number; fill: string}[];
  cloudOpacity: number; gridOpacity: number; phase: number; draws: number; count: number;
};
try {
  run('--executable-path', process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', 'open', `${base}/?experiment=micro-08&time=0&content=1`);
  run('set', 'viewport', '1280', '976');
  const times = [0, 4, 8, 8.5, 9.5, 10, 10.1, 10.2, 10.4, 10.65, 11.3, 12, 1e12, 9, 0];
  const snapshots: Snapshot[] = [];
  for (const time of times) {
    run('open', `${base}/?experiment=micro-08&time=${time}&content=1`);
    const snapshot = evaluate<Snapshot>(`(async()=>{
      const deadline=performance.now()+5000;
      while(document.querySelector('.micro08-dither')?.dataset.ready!=='true') {
        if(performance.now()>deadline)throw new Error('Cloud shader not ready');
        await new Promise(requestAnimationFrame);
      }
      const svg=document.querySelector('.micro08-scene');
      const number=(e,k)=>Number(e.getAttribute(k));
      return {
        heads:Array.from(svg.querySelectorAll('.micro08-agent')).map(g=>({
          transform:g.getAttribute('transform'),radius:number(g.querySelector('.micro08-head'),'r'),fill:g.querySelector('.micro08-head').getAttribute('fill'),
          width:g.querySelector('.micro08-head').getBoundingClientRect().width,
          stroke:number(g.querySelector('.micro08-loader'),'stroke-width')})),
        strips:Array.from(svg.querySelectorAll('.micro08-strip')).map(e=>({x:number(e,'x'),width:number(e,'width'),height:number(e,'height'),opacity:number(e,'opacity')})),
        dots:Array.from(svg.querySelectorAll('.micro08-grid-dot')).map(e=>({x:number(e,'cx'),y:number(e,'cy'),radius:number(e,'r'),opacity:number(e,'opacity'),fill:e.getAttribute('fill')})),
        cloudOpacity:Number(getComputedStyle(document.querySelector('.micro08-cloud')).opacity),
        gridOpacity:number(svg.querySelector('.micro08-grid'),'opacity'),phase:number(svg,'data-strip-phase'),
        draws:Number(document.querySelector('.micro08-dither').dataset.draws),count:svg.querySelectorAll('*').length,
      };
    })()`);
    snapshots.push(snapshot);
    const state = sampleMicro08(time);
    assert.equal(snapshot.heads.length, 7);
    assert.equal(snapshot.strips.length, 7);
    assert.equal(snapshot.dots.length, 105);
    assert.equal(snapshot.count, snapshots[0].count, 'fixed DOM across seek order');
    assert.equal(snapshot.draws, 1, 'static cloud is not redrawn by the outro');
    near(snapshot.phase, state.stripPhase);
    near(snapshot.cloudOpacity, 1 - state.outro.backdropFade);
    near(snapshot.gridOpacity, 1 - state.outro.backdropFade);
    snapshot.heads.forEach((head, index) => {
      const pose = rowPose(index, state.outro);
      assert.equal(head.transform, `translate(${pose.x} ${pose.y})`);
      near(head.radius, pose.radius); near(head.width, pose.radius * 2); near(head.stroke, pose.loaderStrokeWidth);
      assert.equal(head.fill, dotFill(state.outro.dotDim));
      near(snapshot.strips[index].width, pose.x);
      near(snapshot.strips[index].height, pose.radius * 2);
      near(snapshot.strips[index].opacity, pose.streamOpacity);
    });
    snapshot.dots.forEach((dot, index) => {
      const target = gridDotPose(OTHER_DOTS[index], state.outro.gridSlide);
      near(dot.x, target.x); near(dot.y, target.y);
      near(dot.radius, 10); near(dot.opacity, 1);
      assert.equal(dot.fill, dotFill(state.outro.dotDim));
    });
  }
  run('open', `${base}/?experiment=micro-08&time=12&content=1`);
  run('screenshot', '/tmp/micro08-dot-grid-final.png');
  run('set', 'viewport', '900', '800');
  const layout = evaluate<{width: number; height: number; bottom: number}>(`(() => {const r=document.querySelector('.micro08-stage').getBoundingClientRect();return {width:r.width,height:r.height,bottom:r.bottom}})()`);
  near(layout.width / layout.height, 16 / 9);
  assert.ok(layout.bottom <= 800 - 256);
  writeFileSync('/tmp/micro08-outro-browser-evidence.json', JSON.stringify({times, snapshots, layout}, null, 2));
  console.log('Micro08 optional browser checks passed: finite outro, 7 live heads, 105 other dots, stroke widths, ribbon attachments, fixed DOM and responsive layout.');
} finally {
  try { run('close'); } catch { /* Do not mask the original test failure. */ }
}
