import assert from 'node:assert/strict';
import test from 'node:test';
import {flow2WorldState} from '../introducing-flow-1-2/geometry';
import {sampleMicro22} from '../micro-22/sample';
import {MICRO_22_TIMING} from '../micro-22/timeline';
import {chapterSchedule, sampleFlow, sampleUltimate3} from './sample';
import {issueEntryEnd} from './settings';
import {VOICEOVER_DEFAULTS as s} from './voiceover-cut';
import {flowCameraInSharedWorld, flowIssuesCamera, issueSurfacePlacement, projectWorldPoint} from './transitions';

test('blue agent stays completely left of the frame before its entry starts', () => {
  const flow = sampleFlow(s.allocations.flow, s);
  const outgoing = flowCameraInSharedWorld(flow2WorldState(flow.playback21!).camera, flow.worldLayout, flow.playback21);
  const placement = issueSurfacePlacement(outgoing);
  for (const fraction of [0, .2, .4, .6, .8, .999]) {
    const sample = sampleUltimate3(chapterSchedule(s)[3].start + issueEntryEnd(s) * fraction, s);
    const world = sample.issues!.source22!.world;
    assert.ok(world.origin && world.hero && world.bashAgent && world.contentScreenScale !== undefined);
    const right = projectWorldPoint({x: placement.x + placement.scale * (world.hero.x + 60 * world.hero.scale), y: placement.y},
      flowIssuesCamera(outgoing, sample.issues!.entryProgress)).x;
    assert.ok(right <= 0, `agent peeks ${right}px into frame at entry progress ${fraction}`);
    assert.equal(world.origin.x - world.contentScreenScale * world.bashAgent.x, 0, 'trace must not move with the starting-position change');
  }
});

test('farther-left start preserves both authored landing positions', () => {
  const entry = sampleMicro22(0, {}, {blueBashEntry: 1, blueBashStop: 0});
  const stop = sampleMicro22(0, {}, {blueBashEntry: 1, blueBashStop: 1});
  assert.equal(entry.world.bashAgent?.x, 280);
  assert.equal(stop.world.bashAgent?.x, 340);
  const time = MICRO_22_TIMING.blueBashEntry.at + MICRO_22_TIMING.blueBashEntry.duration / 2;
  const before = sampleMicro22(time);
  sampleMicro22(20);
  assert.deepEqual(sampleMicro22(time), before, 'reverse seeks are deterministic');
});
