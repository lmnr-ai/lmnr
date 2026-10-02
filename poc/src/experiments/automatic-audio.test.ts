import assert from 'node:assert/strict';
import {installAutomaticAudioUnlock} from './automatic-audio';

const deferred = () => {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((yes, no) => {resolve = yes; reject = no;});
  return {promise, resolve, reject};
};
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

{
  const target = new EventTarget();
  const attempts = [deferred(), deferred()];
  let calls = 0;
  let ready = 0;
  const cleanup = installAutomaticAudioUnlock(target, () => true, () => attempts[calls++].promise, () => ready++);
  assert.equal(calls, 1, 'playback eagerly attempts to resume audio');
  target.dispatchEvent(new Event('pointerdown'));
  assert.equal(calls, 2, 'a pending autoplay attempt does not suppress a gesture retry');
  attempts[0].reject(new Error('autoplay denied'));
  attempts[1].resolve();
  await flush();
  assert.equal(ready, 1, 'the successful trusted-gesture retry enables playback');
  cleanup();
}

{
  const target = new EventTarget();
  let wanted = false;
  let calls = 0;
  let ready = 0;
  const cleanup = installAutomaticAudioUnlock(target, () => wanted, async () => {calls++;}, () => ready++);
  target.dispatchEvent(new Event('keydown'));
  await flush();
  assert.deepEqual({calls, ready}, {calls: 1, ready: 0}, 'a generic gesture may unlock the context but cannot start effects while paused');
  wanted = true;
  target.dispatchEvent(new Event('keydown'));
  await flush();
  assert.deepEqual({calls, ready}, {calls: 2, ready: 1}, 'an ordinary keyboard gesture retries audio while playback is wanted');
  cleanup();
  target.dispatchEvent(new Event('keydown'));
  await flush();
  assert.equal(calls, 2, 'cleanup removes both unlock listeners');
}

{
  const target = new EventTarget();
  const pending = deferred();
  let ready = 0;
  const cleanup = installAutomaticAudioUnlock(target, () => true, () => pending.promise, () => ready++);
  cleanup();
  pending.resolve();
  await flush();
  assert.equal(ready, 0, 'an async resume completion after unmount cannot restart audio');
}

console.log('Automatic audio: eager resume, gesture retry, paused silence, and lifecycle cleanup passed.');
