import {renderThockKeystroke, THOCK_SAMPLE_RATE} from './thock-typing';
import {ultimate3TypingTickEvents} from './typing-audio';
import type {Ultimate3Settings} from './settings';

export const ARABESQUE_SOUNDTRACK_URL = '/audio/arabesque-acoustic/ultimate3-softness-8-no-typing-v1.wav';
/** Fixed source calibration, NOT normalization of the user's linear master control. */
export const ARABESQUE_BED_CALIBRATION = 1 / 6.98;
export const ARABESQUE_THOCK_TRIM = .2;

/** Exact split-viewer export: mastered bed + dry shared PCM, then one linear master.
 * No second normalization/limiter: that would break live/export gain parity.
 */
export function mixArabesquePlayback(bed: {l: Float32Array; r: Float32Array}, settings: Ultimate3Settings, masterVolume: number, typingVolume: number) {
  const l = Float32Array.from(bed.l, value => value * ARABESQUE_BED_CALIBRATION);
  const r = Float32Array.from(bed.r, value => value * ARABESQUE_BED_CALIBRATION);
  for (const event of ultimate3TypingTickEvents(settings)) {
    const pcm = renderThockKeystroke(event.voice ?? 0), start = Math.round(event.time * THOCK_SAMPLE_RATE);
    for (let n = 0; n < pcm.left.length && start + n < l.length; n++) {
      l[start + n] += pcm.left[n] * typingVolume * ARABESQUE_THOCK_TRIM;
      r[start + n] += pcm.right[n] * typingVolume * ARABESQUE_THOCK_TRIM;
    }
  }
  for (let n = 0; n < l.length; n++) { l[n] *= masterVolume; r[n] *= masterVolume; }
  return {l, r};
}

/** Only the calibrated mastered bed. The sole live keyboard is useIssueTypingAudio. */
export class ArabesqueBedEngine {
  private element?: HTMLAudioElement;
  private context?: AudioContext;
  private master?: GainNode;
  private volume = 0;
  private wanted = {time: 0, playing: false};

  async enable() {
    if (!this.context) {
      this.context = new AudioContext();
      const element = this.element = new Audio(ARABESQUE_SOUNDTRACK_URL);
      element.preload = 'auto';
      const calibration = this.context.createGain(); calibration.gain.value = ARABESQUE_BED_CALIBRATION;
      this.master = this.context.createGain(); this.master.gain.value = this.volume;
      this.context.createMediaElementSource(element).connect(calibration).connect(this.master).connect(this.context.destination);
      element.addEventListener('loadedmetadata', () => this.synchronize());
      element.load();
    }
    await this.context.resume();
    this.synchronize();
  }
  setMasterVolume(value: number) {
    this.volume = Math.max(0, Number.isFinite(value) ? value : 0);
    if (this.master) this.master.gain.value = this.volume;
  }
  update(time: number, playing: boolean) { this.wanted = {time, playing}; this.synchronize(); }
  private synchronize() {
    const element = this.element;
    if (!element) return;
    const {time, playing} = this.wanted;
    const target = Math.max(0, Math.min(Number.isFinite(element.duration) ? element.duration : time, time));
    if (!playing) element.pause();
    if (!playing || Math.abs(element.currentTime - target) > .12) element.currentTime = target;
    if (playing && element.paused) void element.play().then(() => {
      // A pending play promise must not revive audio after a pause/inspection.
      if (!this.wanted.playing) element.pause();
    }).catch(() => {});
  }
  pause() { this.wanted.playing = false; this.element?.pause(); }
  dispose() {
    this.pause();
    if (this.element) { this.element.removeAttribute('src'); this.element.load(); }
    void this.context?.close(); this.context = undefined; this.element = undefined; this.master = undefined;
  }
}
