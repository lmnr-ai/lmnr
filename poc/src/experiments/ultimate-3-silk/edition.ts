import {ULTIMATE3_PANEL_IDS,type Ultimate3PanelIds} from '../micro-18/App';
import {normalizeSettings,ULTIMATE_3_DEFAULTS} from '../micro-18/settings';
import {DEFAULT_SILK_MIX,normalizeSilkMix,SILK_MIX_STORAGE_ID,SILK_SETTINGS_STORAGE_ID} from './types';
export const SILK_PANEL_IDS=Object.fromEntries(Object.keys(ULTIMATE3_PANEL_IDS).map(key=>[key,`ultimate-3-silk-${key}-v1`])) as Ultimate3PanelIds;
export const readSilkSettings=()=>{try{return normalizeSettings(JSON.parse(localStorage.getItem(SILK_SETTINGS_STORAGE_ID)??'null'));}catch{return normalizeSettings(ULTIMATE_3_DEFAULTS);}};
export const readSilkMix=()=>{try{return normalizeSilkMix(JSON.parse(localStorage.getItem(SILK_MIX_STORAGE_ID)??'{}'));}catch{return {...DEFAULT_SILK_MIX};}};
