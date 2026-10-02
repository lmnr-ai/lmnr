import {DialStore, type DialValue, type TransitionConfig} from 'dialkit';
import dialkitPackage from '../../../node_modules/dialkit/package.json';
import {ISSUE_KEYS, MICRO_20_ISSUE_TIMING, MICRO_20_TIMELINE_ID, PRELUDE_KEYS} from './timeline';

type Values = Record<string, DialValue>;
type Controls = Map<string, {type: string}>;
type PrivateSeam = {
  reconcileValues(defaults: Values, previous: Values, controls: Controls): Values;
  persistPanel(id: string): void;
};
const paths = new Set([
  ...PRELUDE_KEYS.map(key => `${key}.transition`),
  ...ISSUE_KEYS.filter(key => MICRO_20_ISSUE_TIMING[key].transition).map(key => `issues.${key}.transition`),
]);
const mode = (value: unknown) => value === 'simple' || value === 'advanced' || value === 'easing';
function transition(value: unknown): value is TransitionConfig {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  const finite = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
  if (v.type === 'easing') return Object.keys(v).every(key => ['type', 'duration', 'ease'].includes(key))
    && finite(v.duration) && v.duration >= 0 && Array.isArray(v.ease) && v.ease.length === 4 && v.ease.every(finite)
    && v.ease[0] >= 0 && v.ease[0] <= 1 && v.ease[2] >= 0 && v.ease[2] <= 1;
  return v.type === 'spring' && Object.entries(v).every(([key, value]) => key === 'type'
    || (['stiffness', 'damping', 'mass', 'visualDuration', 'bounce'].includes(key) && finite(value) && value >= 0
      && (key !== 'mass' || value > 0) && (key !== 'bounce' || value <= 1)));
}
const copyTransition = (value: TransitionConfig): TransitionConfig => value.type === 'easing' ? {...value, ease: [...value.ease]} : {...value};
export const ULTIMATE3_ISSUES_TIMELINE_ID = 'micro-animation-18-issues3-timeline-v1';
const ultimate3Paths = new Set(['leadIn.transition', ...PRELUDE_KEYS.map(key => `prelude_${key}.transition`), ...ISSUE_KEYS.map(key => `postlude_${key}.transition`)]);
const installedKey = Symbol.for('micro20.dialkit-1.4.3-authoring-compatibility');
type Installed = Pick<typeof DialStore, 'registerPanel' | 'updatePanel' | 'updateTransitionMode'> & PrivateSeam & {ownedPaths: Map<string, Set<string>>};
const incompatible = () => new Error('Animation 20 editor disabled: incompatible DialKit authoring API. Saved state has not been registered or rewritten.');

/** Public registration reconciles AND persists all states before returning, so
 * repair through public setters would already have destroyed saved presets.
 * This version-pinned private seam changes only valid transition fields for the
 * owned timeline, before persistence. Defaults and all other fields stay native.
 * No original saved object is changed, and no temporary method escapes a call. */
export function installMicro20AuthoringCompatibility(store = DialStore, version = dialkitPackage.version, enableUltimate3Issues = false, ultimate3IssuesTimelineId = ULTIMATE3_ISSUES_TIMELINE_ID, customPaths?: string[]) {
  const runtime = store as unknown as PrivateSeam & {[installedKey]?: Installed};
  if (version !== '1.4.3' || typeof runtime.reconcileValues !== 'function' || runtime.reconcileValues.length !== 3
    || typeof runtime.persistPanel !== 'function' || runtime.persistPanel.length !== 1
    || typeof store.registerPanel !== 'function' || store.registerPanel.length !== 4
    || typeof store.updatePanel !== 'function' || store.updatePanel.length !== 4
    || typeof store.updateTransitionMode !== 'function' || store.updateTransitionMode.length !== 3) throw incompatible();
  const installed = runtime[installedKey];
  if (installed) {
    if (store.registerPanel !== installed.registerPanel || store.updatePanel !== installed.updatePanel
      || store.updateTransitionMode !== installed.updateTransitionMode || runtime.reconcileValues !== installed.reconcileValues
      || runtime.persistPanel !== installed.persistPanel) throw incompatible();
    if (enableUltimate3Issues) installed.ownedPaths.set(ultimate3IssuesTimelineId, customPaths ? new Set(customPaths) : ultimate3Paths);
    return;
  }
  const ownedPaths = new Map([[MICRO_20_TIMELINE_ID, paths]]);
  if (enableUltimate3Issues) ownedPaths.set(ultimate3IssuesTimelineId, customPaths ? new Set(customPaths) : ultimate3Paths);
  const register = store.registerPanel, update = store.updatePanel, updateMode = store.updateTransitionMode;
  const reconcile = runtime.reconcileValues, persist = runtime.persistPanel;
  const duringRegistration = (id: string, run: () => void) => {
    const paths = ownedPaths.get(id);
    const outerReconcile = runtime.reconcileValues, outerPersist = runtime.persistPanel;
    // A nested foreign registration must explicitly use the ORIGINAL methods,
    // not inherit the owned call's temporary reconciliation/persistence context.
    let calls = 0;
    let base: {values: Values; modes: Values} | undefined;
    runtime.reconcileValues = !paths ? reconcile : function(this: PrivateSeam, defaults, previous, controls) {
      const next = reconcile.call(this, defaults, previous, controls);
      const modes: Values = {};
      for (const path of paths) {
        const value = previous[path];
        if (controls.get(path)?.type !== 'transition' || !transition(value)) continue;
        next[path] = copyTransition(value);
        const key = `${path}.__mode`;
        const fallbackMode = value.type === 'easing' ? 'easing'
          : (value.stiffness !== undefined || value.damping !== undefined || value.mass !== undefined)
            && value.visualDuration === undefined && value.bounce === undefined ? 'advanced' : 'simple';
        next[key] = modes[key] = mode(previous[key]) ? previous[key] : fallbackMode;
      }
      if (++calls === 2) base = {values: next, modes};
      return next;
    };
    runtime.persistPanel = !paths ? persist : function(this: PrivateSeam, panelId) {
      if (panelId === id) {
        // updatePanel copies current modes over base modes AFTER reconciliation.
        // Restore only the independent copied base result, before the write.
        if (!base || calls < 2) throw incompatible();
        Object.assign(base.values, base.modes);
      }
      persist.call(this, panelId);
    };
    try {run();} finally {
      runtime.reconcileValues = outerReconcile;
      runtime.persistPanel = outerPersist;
    }
  };
  store.registerPanel = function(id, name, config, shortcuts, options = {}) {
    duringRegistration(id, () => register.call(this, id, name, config, shortcuts, options));
  };
  store.updatePanel = function(id, name, config, shortcuts, options = {}) {
    duringRegistration(id, () => update.call(this, id, name, config, shortcuts, options));
  };
  store.updateTransitionMode = function(id, path, nextMode) {
    if (ownedPaths.get(id)?.has(path) && mode(nextMode)
      && transition(this.getValue(id, path))) {
      // Unlike DialKit's mode setter, updateValue assigns the edit to the active
      // preset or base as well as current state, preserving their independence.
      this.updateValue(id, `${path}.__mode`, nextMode);
    } else updateMode.call(this, id, path, nextMode);
  };
  Object.defineProperty(runtime, installedKey, {value: {
    registerPanel: store.registerPanel, updatePanel: store.updatePanel, updateTransitionMode: store.updateTransitionMode,
    reconcileValues: reconcile, persistPanel: persist, ownedPaths,
  } satisfies Installed});
}
