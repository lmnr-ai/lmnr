import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {FLOW_ENDPOINT_SCHEDULE, INTRODUCING_FLOW_1_TIMELINE as clips} from './timeline';

const browser = (...args: string[]) => execFileSync('agent-browser', ['--auto-connect', ...args], {encoding: 'utf8'}).trim();
// Reproduce the user's width-constrained 1224×688 preview stage.
browser('set','viewport','1224','1000');
function inspect(time: number) {
  browser('open', `http://localhost:5180/?experiment=introducing-flow-1&time=${time}`);
  const response = browser('eval', `(async () => {
    await document.fonts.ready;
    const stage = document.querySelector('.flow1-scene').getBoundingClientRect();
    const scale = 1280 / stage.width;
    const rect = element => {const b = element.getBoundingClientRect(); return {x:(b.x-stage.x)*scale,y:(b.y-stage.y)*scale,width:b.width*scale,height:b.height*scale};};
    const heading = document.querySelector('.flow1-heading-right');
    const headingLayer = heading.querySelector('.flow1-slide');
    const cs = getComputedStyle(heading,'::after');
    const numberMask = document.querySelector('.flow1-number-mask');
    const nameMask = document.querySelector('.flow1-name-mask');
    const title = document.querySelector('.flow1-title');
    return JSON.stringify({
      viewport:{stage:rect(document.querySelector('.flow1-stage')),scene:rect(document.querySelector('.flow1-scene')),sceneClientWidth:document.querySelector('.flow1-scene').clientWidth,sceneClientHeight:document.querySelector('.flow1-scene').clientHeight},
      names:[...document.querySelectorAll('.flow1-name-mask')].map(rect),
      bars:[...document.querySelectorAll('.flow1-bar')].map(rect),
      rows:[...document.querySelectorAll('.flow1-row')].map(rect),
      heading:rect(heading), leftHeading:rect(document.querySelector('.flow1-heading-left')),
      gridBounds:rect(document.querySelector('.flow1-grid')), headingOutline:cs.backgroundImage,
      maskOutlines:[getComputedStyle(numberMask,'::after').backgroundImage,getComputedStyle(nameMask,'::after').backgroundImage],
      movingOutlines:[getComputedStyle(numberMask.firstElementChild).backgroundImage,getComputedStyle(nameMask.firstElementChild.firstElementChild).backgroundImage],
      title:rect(title), titleOpacity:getComputedStyle(title).opacity,
      oldNumbers:[...document.querySelectorAll('.flow1-number-old')].map(e=>({text:e.textContent,...rect(e)})),
      newNumbers:[...document.querySelectorAll('.flow1-number-new')].map(e=>({text:e.textContent,...rect(e)})),
      masks:[...document.querySelectorAll('.flow1-number-mask')].map(rect),
      moduleColor:getComputedStyle(document.querySelector('.flow1-module')).color,
      connector:rect(document.querySelector('.flow1-connector')),
      thin:rect(document.querySelector('.flow1-connector img:last-child')),
      assembly:rect(document.querySelector('.flow1-assembly')),
      spinner:rect(document.querySelector('.flow1-spinner')),
      spinnerDiscLogical:{width:parseFloat(getComputedStyle(document.querySelector('.flow1-spinner-disc')).width),height:parseFloat(getComputedStyle(document.querySelector('.flow1-spinner-disc')).height)},
      grid:getComputedStyle(document.querySelector('.flow1-grid')).backgroundImage,
    });
  })()`);
  return JSON.parse(JSON.parse(response));
}
const near = (a: number, b: number, label: string, tolerance = 1) => assert.ok(Math.abs(a-b) <= tolerance, `${label}: ${a} != ${b}`);
const [, percentTime, analysisTime, engineTime] = FLOW_ENDPOINT_SCHEDULE.map(item => item.time);
const analysis = inspect(analysisTime);
assert.equal(analysis.viewport.sceneClientWidth,1280,'preview scene uses authored width');
assert.equal(analysis.viewport.sceneClientHeight,720,'preview scene uses authored height');
near(analysis.viewport.scene.width,1280,'preview uniformly scales to stage width');
near(analysis.viewport.scene.height,720,'preview uniformly scales to stage height');
// Figma 4773:11187/11193/11199/11205/11211/11217: hug-content widths, not 980px.
[144,195,772,228,542,342].forEach((width, i) => near(analysis.names[i].width, width, `name mask ${i}`));
[10,27,638,10,307,40].forEach((width, i) => near(analysis.bars[i].width, width, `bar ${i}`));
analysis.rows.forEach((row: any, i: number) => {near(row.x,100,'row x');near(row.y,60+i*60,'row y');});
near(analysis.heading.x,580,'right heading x');near(analysis.heading.y,480,'right heading y');
near(analysis.heading.width,600,'right heading width');near(analysis.heading.height,180,'right heading height');
assert.match(analysis.headingOutline,/linear-gradient/,'heading mask owns its inset lines');
analysis.maskOutlines.forEach((outline: string) => assert.match(outline,/linear-gradient/,'stationary mask owns inset lines'));
analysis.movingOutlines.forEach((outline: string) => assert.equal(outline,'none','moving content must not own inset lines'));
assert.equal(analysis.titleOpacity,'1', 'Flow-1 title must leave through camera movement, not fade');
assert.ok(analysis.title.y+analysis.title.height<0, 'title is naturally above viewport');
const analysisTop = Math.min(analysis.rows[0].y, analysis.heading.y);
const analysisBottom = Math.max(analysis.rows.at(-1).y + analysis.rows.at(-1).height, analysis.heading.y + analysis.heading.height);
near(analysisTop, 720 - analysisBottom, 'analysis vertical margins');
assert.ok(analysis.gridBounds.x <= -60, `grid needs left overscan, starts at ${analysis.gridBounds.x}`);
const engine = inspect(engineTime);
assert.equal(engine.moduleColor,'rgb(26, 26, 26)');
near(engine.thin.width,196,'thin connector width');near(engine.thin.height,98,'thin connector height');
near(engine.thin.x+engine.thin.width/2,engine.connector.x+engine.connector.width/2,'centered connector');
near(engine.assembly.x,471,'assembly x');near(engine.assembly.y,191.5,'assembly y');
near(engine.spinner.width,96,'upper-right spinner rendered width');near(engine.spinner.height,96,'upper-right spinner rendered height');
near(engine.spinnerDiscLogical.width,160,'spinner disc anchored to its parent width');near(engine.spinnerDiscLogical.height,160,'spinner disc anchored to its parent height');
const percentages = inspect(percentTime);
percentages.rows.forEach((row: any, i: number) => near(row.y,300+i*60,'percentage row y'));
const percentageTop = Math.min(percentages.rows[0].y, percentages.leftHeading.y);
const percentageBottom = Math.max(percentages.rows.at(-1).y + percentages.rows.at(-1).height, percentages.leftHeading.y + percentages.leftHeading.height);
near(percentageTop, 720 - percentageBottom, 'percentage vertical margins');
assert.ok(percentages.gridBounds.x <= -60, `grid needs left overscan, starts at ${percentages.gridBounds.x}`);
const percentSamples = [.2,.5,.8].map(fraction => inspect(clips.percentageCountUp.at+clips.percentageCountUp.duration*fraction));
percentSamples.forEach((sample, i) => {
  const value = parseFloat(sample.oldNumbers[2].text);
  assert.ok(value>0&&value<81.9, 'Flow percentage counts visibly, not behind its mask');
  if (i) assert.ok(value>parseFloat(percentSamples[i-1].oldNumbers[2].text));
  sample.oldNumbers.forEach((number: any, row: number) => near(number.y,sample.masks[row].y,'visible percentage layer'));
  assert.equal(sample.oldNumbers[0].text,'89.0%');
});
const countSamples = [.2,.5,.8].map(fraction => inspect(clips.analysisCountUp.at+clips.analysisCountUp.duration*fraction));
countSamples.forEach((sample, i) => sample.newNumbers.forEach((number: any, row: number) => {
  assert.ok(Number(number.text)>0&&Number(number.text)<Number(analysis.newNumbers[row].text), 'all six counts are visibly intermediate');
  near(number.y,sample.masks[row].y,'visible analysis number layer');
  if (i) assert.ok(Number(number.text)>Number(countSamples[i-1].newNumbers[row].text));
}));
console.log(JSON.stringify({analysis, engine, percentages, percentageValues:percentSamples.map(s=>s.oldNumbers[2].text),countValues:countSamples.map(s=>s.newNumbers.map((n:any)=>n.text))}, null, 2));
console.log('Animation 13 Figma hug widths, grid landmarks, title camera exit and connector layout passed.');
