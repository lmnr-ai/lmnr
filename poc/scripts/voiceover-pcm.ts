// WAV codecs shared by the editable-voiceover export and bed builders.
import type {StereoPcm} from '../src/experiments/micro-18/voiceover-schedule';

export const decodePcm24 = (wav: Buffer): StereoPcm => {
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Expected RIFF WAVE');
  let format = 0, channels = 0, sampleRate = 0, data = -1, size = 0;
  for (let at = 12; at + 8 <= wav.length;) {
    const name = wav.toString('ascii', at, at + 4), length = wav.readUInt32LE(at + 4);
    if (name === 'fmt ') {format = wav.readUInt16LE(at + 8); channels = wav.readUInt16LE(at + 10); sampleRate = wav.readUInt32LE(at + 12);
      if (format === 65534) format = wav.readUInt16LE(at + 32);}
    if (name === 'data') {data = at + 8; size = length; break;}
    at += 8 + length + (length % 2);
  }
  if (format !== 1 || channels !== 2 || sampleRate !== 48000 || data < 0 || size % 6) throw new Error('Expected stereo 48kHz PCM24');
  const l = new Float32Array(size / 6), r = new Float32Array(size / 6);
  for (let n = 0; n < l.length; n++) {l[n] = wav.readIntLE(data + n * 6, 3) / 8388608; r[n] = wav.readIntLE(data + n * 6 + 3, 3) / 8388608;}
  return {l, r};
};

export const encodeFloat32 = (pcm: StereoPcm) => {
  const bytes = Buffer.alloc(44 + pcm.l.length * 8);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(3, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(384000, 28); bytes.writeUInt16LE(8, 32); bytes.writeUInt16LE(32, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(pcm.l.length * 8, 40);
  for (let n = 0; n < pcm.l.length; n++) {bytes.writeFloatLE(pcm.l[n], 44 + n * 8); bytes.writeFloatLE(pcm.r[n], 48 + n * 8);}
  return bytes;
};

/** Stereo 48 kHz PCM24; `decodePcm24(encodePcm24(x))` is the exact value the browser decodes. */
export const encodePcm24 = (pcm: StereoPcm) => {
  const bytes = Buffer.alloc(44 + pcm.l.length * 6);
  bytes.write('RIFF', 0); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(2, 22); bytes.writeUInt32LE(48000, 24);
  bytes.writeUInt32LE(288000, 28); bytes.writeUInt16LE(6, 32); bytes.writeUInt16LE(24, 34);
  bytes.write('data', 36); bytes.writeUInt32LE(pcm.l.length * 6, 40);
  for (let n = 0; n < pcm.l.length; n++) for (const [channel, value] of [[0, pcm.l[n]], [1, pcm.r[n]]])
    bytes.writeIntLE(Math.round(Math.max(-1, Math.min(8388607 / 8388608, value)) * 8388608), 44 + n * 6 + channel * 3, 3);
  return bytes;
};
