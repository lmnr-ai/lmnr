import type {Ultimate3Settings} from '../micro-18/settings';
import type {Ultimate3MusicPlan} from '../micro-18/ultimate3-music';
export const SILK_BUSES = ['agent','material','air','sparkle','typing','music'] as const;
export type SilkBus = typeof SILK_BUSES[number];
export const SAMPLE_RATE = 48000;
export const RECIPE_VERSION = 'silk-refined-motion-pcm-1';
export const MUSIC_RENDERER = 'sangers-uncompressed-pcm-1';
export type StereoPCM = readonly [Float32Array, Float32Array];
export type SilkStems = Record<SilkBus, StereoPCM>;
export type SilkMix = Record<SilkBus | 'master', number>;
export const DEFAULT_SILK_MIX: Readonly<SilkMix> = Object.freeze({master:1,agent:1,material:10**(-3/20),air:10**(-7/20),sparkle:1,typing:10**(-10/20),music:0});
export const SILK_MIX_STORAGE_ID = 'ultimate-3-silk-mix-v1';
export const SILK_SETTINGS_STORAGE_ID = 'ultimate-3-silk-settings-v1';
export const DEFAULT_MIX_LABEL = 'SFX-only (music off)';
export function normalizeSilkMix(input: Partial<SilkMix> = {}): SilkMix {
  return Object.fromEntries(Object.entries(DEFAULT_SILK_MIX).map(([key, fallback]) => {
    const v=input[key as keyof SilkMix];
    return [key, typeof v==='number' && Number.isFinite(v) ? Math.max(0,Math.min(2,v)) : fallback];
  })) as SilkMix;
}
export type MotionPoint = {time:number; turns:number; distance:number; pan:number; gain:number; brightness:number};
export type SilkMotion = {id:string; bus:'agent'; points:readonly MotionPoint[]};
export type SilkRecipe = 'release'|'seat'|'air'|'lift'|'down'|'halo'|'touch'|'flourish';
export type SilkCue = {id:string; bus:Exclude<SilkBus,'agent'|'music'>; at:number; duration:number; seed:number; recipe:SilkRecipe; gain:number; pan:number; notes?:readonly number[]; principal?:boolean};
export type SilkPlan = {version:1; identity:string; settingsKey:string; recipeVersion:string; assetIdentity:string; settings:Ultimate3Settings; semanticDuration:number; frameDuration:number; sampleRate:48000; motions:readonly SilkMotion[]; cues:readonly SilkCue[]; music:Ultimate3MusicPlan; chapterStarts:{cost:number;flow:number;issues:number;conclusion:number}};
export type VerifiedPianoPCM = {assetIdentity:string; samples:ReadonlyMap<number,{pcm:Float32Array;onset:number}>};
/** Sorted serialization is also the collision-free settings identity; no platform-specific hash dependency. */
export function canonical(value:unknown):string {
  if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
  if(value && typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}';
  return JSON.stringify(value);
}
export const mixIdentity = (mix:Partial<SilkMix>) => canonical(normalizeSilkMix(mix));
