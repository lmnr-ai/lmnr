import {Stereo, db, limit, pingPong, reverb, samples, seeded} from './dsp';
import {impact, keyClick, Mix, piano, puff, thock, whoosh, type PianoBank, type Route} from './voices';
import {normalizeEffectTuning, type EffectKind, type EffectTuning} from './tuning';

const SFX: Route = {bus: 'sfx', room: .2, hall: .16, delay: .12};

/** A short, deterministic audition rendered by the same voices used in the full score. */
export function renderEffectPreview(kind: EffectKind, pianoBank: PianoBank, input: EffectTuning) {
  const tuning = normalizeEffectTuning(input);
  const length = samples(kind === 'impact' ? 4.2 : 3.4);
  const mix = new Mix(length, seeded(0xa8ab35), pianoBank, {}, tuning);
  const at = .25;

  if (kind === 'pianoCue') {
    [88, 85, 76].forEach((midi, index) => piano(mix, at + index * .28, midi, [.45, .38, .24][index], {...SFX, pan: (index - 1) * .18}, {length: index === 2 ? 1.6 : .8, bright: .5}));
  } else if (kind === 'whoosh') {
    whoosh(mix, at, 1.15, {...SFX, pan: 0}, {from: 300, to: 2200, level: .3, peak: .68, q: 1.1, air: .4, panFrom: -.45, panTo: .45});
  } else if (kind === 'puff') {
    puff(mix, at, .32, {...SFX, pan: -.1}, 1400);
  } else if (kind === 'thock') {
    thock(mix, at, .5, SFX, .8);
    thock(mix, at + .65, .45, {...SFX, pan: .2}, 1.3);
  } else if (kind === 'impact') {
    impact(mix, at, .22, {bus: 'sfx', hall: .08});
  } else if (kind === 'keyClick') {
    for (let index = 0; index < 8; index++) keyClick(mix, at + index * (.07 + (index % 3) * .012), .38, {...SFX, pan: (index % 4 - 1.5) * .12});
  }

  const hall = reverb(mix.hall, {rt60: 3.4, predelay: .03, damping: 5600, size: 1.6, lowCut: 200});
  const room = reverb(mix.room, {rt60: .65, predelay: .006, damping: 7000, size: .55, lowCut: 250});
  const delay = pingPong(mix.delay, 1 / 3, .36, 3600);
  const output = new Stereo(length);
  for (let n = 0; n < length; n++) {
    output.l[n] = mix.sfx.l[n] * tuning.mix.sfx + hall.l[n] * 2.5 * tuning.mix.hall + room.l[n] * 1.3 * tuning.mix.room + delay.l[n] * 1.1 * tuning.mix.delay;
    output.r[n] = mix.sfx.r[n] * tuning.mix.sfx + hall.r[n] * 2.5 * tuning.mix.hall + room.r[n] * 1.3 * tuning.mix.room + delay.r[n] * 1.1 * tuning.mix.delay;
  }
  limit(output, db(-1));
  return output;
}
