import { z } from "zod/v4";

/** Per-signal switches stored in `signals.metadata`. A missing key means off: signals predating it never opted in. */
export interface SignalSettings {
  /** Laminar agent writes a report on each new L1 cluster. */
  reportsEnabled: boolean;
  /** Clusters can be marked resolved and reopened. */
  resolvingEnabled: boolean;
  /** Open clusters with no events for `AUTO_RESOLVE_DAYS` are resolved by app-server's hourly job. Needs resolving. */
  autoResolveEnabled: boolean;
}

/** Quiet days before an auto-resolve; app-server's `clustering/private/auto_resolve` uses the same number. */
export const AUTO_RESOLVE_DAYS = 30;

export const SIGNAL_SETTINGS_OFF: SignalSettings = {
  reportsEnabled: false,
  resolvingEnabled: false,
  autoResolveEnabled: false,
};

/** What a new signal starts with (the blank form, seeded defaults, most templates). */
export const NEW_SIGNAL_SETTINGS: SignalSettings = {
  reportsEnabled: true,
  resolvingEnabled: true,
  autoResolveEnabled: false,
};

/** Request fields for create/update; an omitted field keeps the stored value on update. */
export const SignalSettingsPatchSchema = z.object({
  reportsEnabled: z.boolean().optional(),
  resolvingEnabled: z.boolean().optional(),
  autoResolveEnabled: z.boolean().optional(),
});
export type SignalSettingsPatch = z.infer<typeof SignalSettingsPatchSchema>;

const KEYS = Object.keys(SIGNAL_SETTINGS_OFF) as (keyof SignalSettings)[];

export function readSignalSettings(metadata: unknown): SignalSettings {
  const stored = (metadata ?? {}) as Partial<Record<keyof SignalSettings, unknown>>;
  return Object.fromEntries(KEYS.map((k) => [k, stored[k] === true])) as unknown as SignalSettings;
}

/** `metadata` with the patch's defined settings written over it; other keys are kept. */
export function writeSignalSettings<M extends object>(
  metadata: M,
  patch: SignalSettingsPatch
): M & SignalSettingsPatch {
  const next: M & SignalSettingsPatch = { ...metadata };
  for (const k of KEYS) if (patch[k] !== undefined) next[k] = patch[k];
  return next;
}
