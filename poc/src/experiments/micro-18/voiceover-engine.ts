import type {Ultimate3Settings} from './settings';
import {VOICEOVER_BEDS, VOICEOVER_PHRASES, VOICEOVER_SOURCE_ROOT, type VoiceoverBedId} from './voiceover-phrases';
import {phraseGain, voiceoverSchedule, VOICEOVER_CALIBRATION, VOICEOVER_FADE} from './voiceover-schedule';

/** One AudioContext/master; one voice-free keyboard-bearing bed (switchable for A/B) plus authored phrase buffers. */
export class VoiceoverEngine {
  private context?: AudioContext;
  private master?: GainNode;
  private buffers?: Map<string, AudioBuffer>;
  private loading?: Promise<void>;
  private active: AudioBufferSourceNode[] = [];
  private wanted?: {time: number; playing: boolean; settings: Ultimate3Settings; seekGeneration: number};
  private anchor?: {time: number; clock: number; signature: string; seekGeneration: number};
  private volume = 6.98;
  private bed: VoiceoverBedId = 'arabesque';
  private beds = new Map<VoiceoverBedId, Promise<AudioBuffer>>();
  private bedBuffers = new Map<VoiceoverBedId, AudioBuffer>();
  private disposed = false;

  async enable() {
    if (this.disposed) return;
    if (!this.context) {
      const context = this.context = new AudioContext();
      this.master = context.createGain(); this.master.gain.value = this.volume;
      this.master.connect(context.destination);
      this.loading = Promise.all([this.loadBed(this.bed), ...VOICEOVER_PHRASES.map(async p => [p.id, await this.decode(VOICEOVER_SOURCE_ROOT + p.file)] as const)])
        .then(([, ...entries]) => {if (!this.disposed) this.buffers = new Map(entries);});
    }
    const context = this.context;
    // The resume is called from the user's gesture even while decode is pending.
    await context.resume();
    try { await this.loading; } catch (error) {
      this.loading = undefined; this.context = undefined; this.master = undefined;
      this.beds.clear();
      void context.close(); throw error;
    }
    if (!this.disposed) this.synchronize();
  }
  /** Switch the bed; playback re-anchors at the current time once the new bed is decoded. */
  setBed(id: VoiceoverBedId) {
    if (!Object.hasOwn(VOICEOVER_BEDS, id) || id === this.bed) return;
    this.bed = id;
    if (this.context) this.loadBed(id).then(() => this.synchronize(), error => console.error(error));
  }
  private async decode(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load voiceover source: ${url}`);
    return this.context!.decodeAudioData(await response.arrayBuffer());
  }
  private loadBed(id: VoiceoverBedId) {
    let pending = this.beds.get(id);
    if (!pending) {
      pending = this.decode(VOICEOVER_BEDS[id].url).then(buffer => {this.bedBuffers.set(id, buffer); return buffer;});
      pending.catch(() => this.beds.delete(id));
      this.beds.set(id, pending);
    }
    return pending;
  }
  setMasterVolume(volume: number) {
    this.volume = Math.max(0, Number.isFinite(volume) ? volume : 0);
    if (this.master) this.master.gain.value = this.volume;
  }
  update(time: number, playing: boolean, settings: Ultimate3Settings, seekGeneration = 0) {
    this.wanted = {time, playing, settings, seekGeneration};
    this.synchronize();
  }
  pause() { if (this.wanted) this.wanted.playing = false; this.stop(); }
  private stop() {
    for (const node of this.active) { try { node.stop(); } catch {} node.disconnect(); }
    this.active = []; this.anchor = undefined;
  }
  private synchronize() {
    const context = this.context, master = this.master, buffers = this.buffers, wanted = this.wanted, bed = this.bedBuffers.get(this.bed);
    if (!wanted?.playing || this.disposed) {this.stop(); return;}
    if (!context || !master || !buffers || !bed || context.state !== 'running') return;
    const signature = JSON.stringify([this.bed, wanted.settings.voiceover]);
    if (this.anchor?.signature === signature && this.anchor.seekGeneration === wanted.seekGeneration
      && Math.abs(wanted.time - this.anchor.time - (context.currentTime - this.anchor.clock)) < .12) return;
    this.stop();
    const time = Math.max(0, wanted.time), clock = context.currentTime;
    this.anchor = {time, clock, signature, seekGeneration: wanted.seekGeneration};
    const start = (buffer: AudioBuffer, at: number, offset: number, duration: number, phrase = false) => {
      if (duration <= 0 || offset >= buffer.duration) return;
      const source = context.createBufferSource(); source.buffer = buffer;
      const gain = context.createGain(); gain.gain.value = VOICEOVER_CALIBRATION;
      source.connect(gain).connect(master);
      const when = clock + Math.max(0, at - time), local = Math.max(0, offset);
      const length = Math.min(duration, buffer.duration - local);
      if (phrase) {
        gain.gain.setValueAtTime(VOICEOVER_CALIBRATION * phraseGain(local, offset + duration), when);
        const total = offset + duration;
        const knots = total < 2 * VOICEOVER_FADE ? [total / 2] : [VOICEOVER_FADE, total - VOICEOVER_FADE];
        for (const point of knots) {
          if (point > local && point < local + length) gain.gain.linearRampToValueAtTime(
            VOICEOVER_CALIBRATION * phraseGain(point, offset + duration), when + point - local);
        }
        gain.gain.linearRampToValueAtTime(0, when + length);
      }
      source.start(when, local, length);
      this.active.push(source);
    };
    if (time < bed.duration) start(bed, time, time, bed.duration - time);
    for (const phrase of voiceoverSchedule(wanted.settings)) {
      if (phrase.duration <= 0 || phrase.end <= time) continue;
      const offset = Math.max(0, time - phrase.at);
      start(buffers.get(phrase.id)!, phrase.at, offset, phrase.duration - offset, true);
    }
  }
  dispose() { this.disposed = true; this.pause(); void this.context?.close(); this.context = undefined; this.buffers = undefined; this.bedBuffers.clear(); }
}
