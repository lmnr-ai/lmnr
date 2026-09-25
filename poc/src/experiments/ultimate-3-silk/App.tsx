import {Micro18App,type Ultimate3Edition} from '../micro-18/App';
import {SilkAudioPanel} from './AudioPanel';
import {SILK_PANEL_IDS,readSilkSettings} from './edition';
import {SILK_SETTINGS_STORAGE_ID} from './types';
import {mergeSilkAuthoring} from './authoring-state';
export const SILK_EDITION:Ultimate3Edition={experimentId:'ultimate-3-silk',settingsStorageId:SILK_SETTINGS_STORAGE_ID,panelIds:SILK_PANEL_IDS,readSettings:readSilkSettings,mergeSettings:mergeSilkAuthoring,Audio:SilkAudioPanel};
export const Ultimate3SilkApp=()=> <Micro18App edition={SILK_EDITION}/>;
