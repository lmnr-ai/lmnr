import type {DialConfig} from 'dialkit';

export const SOUND_MIX_ID = 'micro-animation-18-stream-run-sound-v1';
const slider = (value:number,min:number,max:number,step:number): [number,number,number,number] => [value,min,max,step];

const noteOptions = [60,62,64,65,67,69,71,72,74,76,77,79,81,83,84].map(value => ({value:String(value),label:['C','D','E','F','G','A','B'][[0,2,4,5,7,9,11].indexOf(value % 12)] + (Math.floor(value / 12) - 1)}));

/** Sound controls are grouped by every chapter in which their scheduled voices occur. */
export const ULTIMATE_3_SOUND_CONFIG = {
  Shared: {
    masterVolume:slider(6.98,0,10,.01),
    musicVolume:[0,0,1,.01],
    errorToneVolume:[.11,0,1.5,.01],
    cloudVolume:[1,0,1.5,.01],
    drawerVolume:[.3,0,1.5,.01],
    drawerOpening:{type:'select',options:[{value:'bubblePair',label:'Bubble pair'},{value:'whistleWhoosh',label:'Whistle whoosh (default)'}],default:'whistleWhoosh'},
    cameraVolume:[.6,0,1.5,.01],
    cameraSound:{type:'select',options:[{value:'procedural',label:'Original procedural whoosh'},{value:'deepCamera',label:'Deep camera whoosh'}],default:'procedural'},
    cameraDurationMultiplier:[1,0.5,3,.05],
    agentWindowSlideVolume:[.3,0,1.5,.01],
    agentWindowClickVolume:[.15,0,1.5,.01],
  },
  'Ultimate 2': {
    _collapsed:true,
    tickVolume:[2,0,10,.01],
    puffVolume:[1,0,1.5,.01],
    puffOffset:[.56,0,.7,.01],
  },
  Cost: {_collapsed:true,costRatchetVolume:[2,0,10,.01]},
  'Introducing Flow-1': {
    _collapsed:true,
    flowRevealVolume:[1,0,1.5,.01],
    flowRevealTimeToPeak:[1.25,.05,8,.01],
    flowRevealTail:[12.04,.1,20,.01],
    flowRatchetVolume:[.08,0,1.5,.01],
    flowRatchetInterval:[.02,.01,.4,.01],
    numberDropVolume:[.37,0,1.5,.01],
    numberDropBase:{type:'select',options:noteOptions,default:'84'},
    twinkleVolume:[.22,0,1.5,.01],
    twinkleDensity:[11.5,1,16,.5],
    twinkleTimeToPeak:[1.7,.1,8,.05],
    twinkleTail:[4.4,.5,20,.1],
    twinkleBase:{type:'select',options:noteOptions,default:'79'},
  },
  'Issue clusters 2': {_collapsed:true,typingVolume:[1,0,10,.01]},
  Conclusion: {_collapsed:true},
} satisfies DialConfig;

export type Ultimate3SoundMix = {
  masterVolume:number; musicVolume:number; errorToneVolume:number; tickVolume:number; costRatchetVolume:number;
  puffVolume:number; puffOffset:number; cloudVolume:number; drawerVolume:number; cameraVolume:number;
  cameraSound:'procedural'|'deepCamera'; cameraDurationMultiplier:number;
  flowRevealVolume:number; flowRevealTimeToPeak:number; flowRevealTail:number; flowRatchetVolume:number;
  flowRatchetInterval:number; numberDropVolume:number; numberDropBase:string; twinkleVolume:number;
  twinkleDensity:number; twinkleTimeToPeak:number; twinkleTail:number; twinkleBase:string;
  agentWindowSlideVolume:number; agentWindowClickVolume:number; drawerOpening:'bubblePair'|'whistleWhoosh'; typingVolume:number;
};

/** Frozen production defaults; deliberately music=0 (do not restore the old .18 engine default). */
export const ULTIMATE_3_SOUND_DEFAULT_MIX: Ultimate3SoundMix = Object.freeze({
  masterVolume:6.98,musicVolume:0,errorToneVolume:.11,cloudVolume:1,drawerVolume:.3,drawerOpening:'whistleWhoosh',cameraVolume:.6,cameraSound:'procedural',cameraDurationMultiplier:1,agentWindowSlideVolume:.3,agentWindowClickVolume:.15,
  tickVolume:2,puffVolume:1,puffOffset:.56,costRatchetVolume:2,
  flowRevealVolume:1,flowRevealTimeToPeak:1.25,flowRevealTail:12.04,flowRatchetVolume:.08,flowRatchetInterval:.02,
  numberDropVolume:.37,numberDropBase:'84',twinkleVolume:.22,twinkleDensity:11.5,twinkleTimeToPeak:1.7,twinkleTail:4.4,twinkleBase:'79',typingVolume:1,
});

export function normalizeUltimate3SoundMix(input: Record<string, unknown>): Ultimate3SoundMix {
  const result = {...ULTIMATE_3_SOUND_DEFAULT_MIX} as Record<string, unknown>;
  for (const key of Object.keys(ULTIMATE_3_SOUND_DEFAULT_MIX)) if (input[key] !== undefined) result[key] = input[key];
  for (const key of Object.keys(result)) {
    if (key === 'drawerOpening' || key === 'cameraSound' || key === 'numberDropBase' || key === 'twinkleBase') continue;
    const value = Number(result[key]);
    if (!Number.isFinite(value) || value < 0) throw new Error(`Invalid Ultimate 3 sound mix value: ${key}`);
    result[key] = value;
  }
  if (result.drawerOpening !== 'bubblePair' && result.drawerOpening !== 'whistleWhoosh') throw new Error('Invalid drawerOpening');
  if (result.cameraSound !== 'procedural' && result.cameraSound !== 'deepCamera') throw new Error('Invalid cameraSound');
  result.numberDropBase = String(result.numberDropBase);
  result.twinkleBase = String(result.twinkleBase);
  return result as Ultimate3SoundMix;
}

export function flattenUltimate3SoundMix(grouped: any): Ultimate3SoundMix {
  return {...grouped.Shared,...grouped['Ultimate 2'],...grouped.Cost,...grouped['Introducing Flow-1'],...grouped['Issue clusters 2']} as Ultimate3SoundMix;
}

const PATHS: Record<string,string> = {
  masterVolume:'Shared.masterVolume', musicVolume:'Shared.musicVolume', errorToneVolume:'Shared.errorToneVolume', cloudVolume:'Shared.cloudVolume', drawerVolume:'Shared.drawerVolume', drawerOpening:'Shared.drawerOpening', cameraVolume:'Shared.cameraVolume', cameraSound:'Shared.cameraSound', cameraDurationMultiplier:'Shared.cameraDurationMultiplier', agentWindowSlideVolume:'Shared.agentWindowSlideVolume', agentWindowClickVolume:'Shared.agentWindowClickVolume',
  tickVolume:'Ultimate 2.tickVolume', puffVolume:'Ultimate 2.puffVolume', puffOffset:'Ultimate 2.puffOffset',
  costRatchetVolume:'Cost.costRatchetVolume',
  flowRevealVolume:'Introducing Flow-1.flowRevealVolume', flowRevealTimeToPeak:'Introducing Flow-1.flowRevealTimeToPeak', flowRevealTail:'Introducing Flow-1.flowRevealTail', flowRatchetVolume:'Introducing Flow-1.flowRatchetVolume', flowRatchetInterval:'Introducing Flow-1.flowRatchetInterval', numberDropVolume:'Introducing Flow-1.numberDropVolume', numberDropBase:'Introducing Flow-1.numberDropBase', twinkleVolume:'Introducing Flow-1.twinkleVolume', twinkleDensity:'Introducing Flow-1.twinkleDensity', twinkleTimeToPeak:'Introducing Flow-1.twinkleTimeToPeak', twinkleTail:'Introducing Flow-1.twinkleTail', twinkleBase:'Introducing Flow-1.twinkleBase',
};

export function migrateSoundMixRecord<T extends Record<string,unknown>>(values: T): T {
  const migrated: Record<string,unknown> = {...values};
  for (const [oldPath,newPath] of Object.entries(PATHS)) {
    if (oldPath in migrated && !(newPath in migrated)) migrated[newPath] = migrated[oldPath];
    delete migrated[oldPath];
  }
  return migrated as T;
}

/** Load-only migration: call before DialKit registers the panel. */
export function migrateUltimate3SoundStorage(storage: Pick<Storage,'getItem'|'setItem'> = localStorage) {
  const key = `dialkit:${SOUND_MIX_ID}`;
  try {
    const raw = storage.getItem(key);
    if (!raw) return;
    const stored = JSON.parse(raw);
    if (!stored || typeof stored !== 'object') return;
    if (stored.values && typeof stored.values === 'object') stored.values = migrateSoundMixRecord(stored.values);
    if (stored.baseValues && typeof stored.baseValues === 'object') stored.baseValues = migrateSoundMixRecord(stored.baseValues);
    if (Array.isArray(stored.presets)) stored.presets = stored.presets.map((preset: any) => preset?.values && typeof preset.values === 'object' ? {...preset,values:migrateSoundMixRecord(preset.values)} : preset);
    const next = JSON.stringify(stored);
    if (next !== raw) storage.setItem(key,next);
  } catch {}
}
