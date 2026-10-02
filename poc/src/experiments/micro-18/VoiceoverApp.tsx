import {useEffect, useRef} from 'react';
import {DialStore, useDialKit} from 'dialkit';
import {useAutomaticAudio} from '../automatic-audio';
import {installMicro20AuthoringCompatibility} from '../micro-20/authoring';
import {Micro18App, ULTIMATE3_PANEL_IDS, type Ultimate3AudioProps, type Ultimate3Edition, type Ultimate3PanelIds} from './App';
import {VoiceoverEngine} from './voiceover-engine';
import {VOICEOVER_BEDS, type VoiceoverBedId} from './voiceover-phrases';
import {VOICEOVER_SETTINGS_ID} from './voiceover-cut';
import {CURRENT_MIX_ID, CURRENT_SOUNDTRACK, loadCurrentVoiceoverSettings, normalizeCurrentVoiceoverSettings} from './current-cut';

const SOUNDTRACKS = Object.entries(VOICEOVER_BEDS).map(([value, bed]) => ({value, label: bed.label}));

export const VOICEOVER_PANEL_IDS = Object.fromEntries(Object.keys(ULTIMATE3_PANEL_IDS).map(key =>
  [key, `ultimate3-voiceover-${key}-v4`])) as Ultimate3PanelIds;

function VoiceoverAudio({settings, globalTime, playing, inspecting, seekGeneration}: Ultimate3AudioProps) {
  const mix = useDialKit('Ultimate 3 · Voiceover mix', {
    masterVolume: [6.98, 0, 10, .01],
    // The current cut is shared across browsers; older beds remain auditionable.
    soundtrack: {type: 'select', options: SOUNDTRACKS, default: CURRENT_SOUNDTRACK},
  }, {id: CURRENT_MIX_ID, persist: true});
  const engine = useRef<VoiceoverEngine | null>(null);
  engine.current ??= new VoiceoverEngine();
  const active = playing && !inspecting;
  const ready = useAutomaticAudio(engine.current, active);
  const disposal = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (disposal.current !== null) clearTimeout(disposal.current);
    return () => {
      engine.current?.pause();
      // StrictMode replays effects without remounting refs; avoid reviving a disposed engine.
      disposal.current = setTimeout(() => engine.current?.dispose(), 0);
    };
  }, []);
  useEffect(() => engine.current?.setMasterVolume(mix.masterVolume), [mix.masterVolume]);
  useEffect(() => engine.current?.setBed(mix.soundtrack as VoiceoverBedId), [mix.soundtrack]);
  useEffect(() => engine.current?.update(globalTime, active, settings, seekGeneration), [globalTime, active, ready, settings, seekGeneration]);
  return <span title="Editable, unstretched phrase trims over the frozen v4 keyboard-bearing score. No old mixed voiceover plays on this route.">
    Editable voiceover · <a href="?experiment=micro-18&cut=original">Original cut</a>
    {settings.issues.sourceVersion === 22 && <span> · New report captions; replacement recording and sound alignment pending.</span>}
  </span>;
}

const edition: Ultimate3Edition = {
  experimentId: 'micro-18', settingsStorageId: VOICEOVER_SETTINGS_ID, panelIds: VOICEOVER_PANEL_IDS,
  editableVoiceover: true, normalizeSettings: normalizeCurrentVoiceoverSettings,
  readSettings: () => {
    installMicro20AuthoringCompatibility(DialStore, undefined, true, VOICEOVER_PANEL_IDS.issues);
    return loadCurrentVoiceoverSettings(localStorage);
  },
  Audio: VoiceoverAudio,
};

export const VoiceoverMicro18App = () => <Micro18App edition={edition}/>;
