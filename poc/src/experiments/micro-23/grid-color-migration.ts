import type {DialStore} from 'dialkit';
import {MICRO_23_CONTROLS_ID, MICRO_23_DEFAULTS} from './timeline';

export const GRID_COLOR_MIGRATION = 'micro23:dense-grid-1f-v1';
type Store = Pick<typeof DialStore, 'getValue' | 'getActivePresetId' | 'updateValue'>;

/** One-time upgrade of the old default in the working base, never saved presets. */
export function migrateGridColor(store: Store, storage: Pick<Storage, 'getItem' | 'setItem'>): void {
  try {
    if (storage.getItem(GRID_COLOR_MIGRATION)) return;
    const color = store.getValue(MICRO_23_CONTROLS_ID, 'gridColor');
    if (typeof color !== 'string') return; // Wait until the owned panel is registered.
    const oldDefault = ['#333333', '#292929'].includes(color.toLowerCase());
    const update = oldDefault && !store.getActivePresetId(MICRO_23_CONTROLS_ID);
    storage.setItem(GRID_COLOR_MIGRATION, JSON.stringify({previousColor: color, applied: update}));
    if (update) store.updateValue(MICRO_23_CONTROLS_ID, 'gridColor', MICRO_23_DEFAULTS.gridColor);
  } catch {
    // Restricted storage must not break authoring or reset any other controls.
  }
}
