import { z } from "zod/v4";

/** Per-signal switches stored in `signals.metadata`. A missing key reads as `SIGNAL_SETTINGS_DEFAULTS`. */
export interface SignalSettings {
  /** Laminar agent writes a report on each new L1 cluster. */
  reportsEnabled: boolean;
  /** Open clusters with no events for `AUTO_RESOLVE_DAYS` are resolved by app-server's hourly job. */
  autoResolveEnabled: boolean;
}

/** Quiet days before an auto-resolve; app-server's `clustering/private/auto_resolve` uses the same number. */
export const AUTO_RESOLVE_DAYS = 30;

/**
 * What a missing key reads as. Reports stay off for signals that predate them; auto-resolve is on until turned off,
 * which app-server's `clustering/private/auto_resolve` matches.
 */
export const SIGNAL_SETTINGS_DEFAULTS: SignalSettings = {
  reportsEnabled: false,
  autoResolveEnabled: true,
};

/** What a new signal starts with (the blank form, seeded defaults, most templates). */
export const NEW_SIGNAL_SETTINGS: SignalSettings = {
  reportsEnabled: true,
  autoResolveEnabled: true,
};

/** Request fields for create/update; an omitted field keeps the stored value on update. */
export const SignalSettingsPatchSchema = z.object({
  reportsEnabled: z.boolean().optional(),
  autoResolveEnabled: z.boolean().optional(),
});
export type SignalSettingsPatch = z.infer<typeof SignalSettingsPatchSchema>;

const KEYS = Object.keys(SIGNAL_SETTINGS_DEFAULTS) as (keyof SignalSettings)[];

/** A missing key reads as its default; any other non-boolean reads as off. */
export function readSignalSettings(metadata: unknown): SignalSettings {
  const stored = (metadata ?? {}) as Partial<Record<keyof SignalSettings, unknown>>;
  return Object.fromEntries(
    KEYS.map((k) => [k, stored[k] === undefined ? SIGNAL_SETTINGS_DEFAULTS[k] : stored[k] === true])
  ) as unknown as SignalSettings;
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
