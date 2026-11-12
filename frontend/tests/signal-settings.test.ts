import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  NEW_SIGNAL_SETTINGS,
  readSignalSettings,
  SIGNAL_SETTINGS_DEFAULTS,
  writeSignalSettings,
} from "@/lib/signals/settings";

describe("signal settings", () => {
  it("reads a missing setting as its default and a non-boolean as off", () => {
    assert.deepEqual(readSignalSettings(null), SIGNAL_SETTINGS_DEFAULTS);
    assert.deepEqual(readSignalSettings({ reportsEnabled: true, autoResolveEnabled: "yes" }), {
      reportsEnabled: true,
      autoResolveEnabled: false,
    });
  });

  it("reads auto-resolve as on until it is turned off", () => {
    assert.equal(readSignalSettings({}).autoResolveEnabled, true);
    assert.equal(readSignalSettings({ autoResolveEnabled: false }).autoResolveEnabled, false);
  });

  it("reads only the settings, not other metadata", () => {
    assert.deepEqual(
      readSignalSettings({ ...NEW_SIGNAL_SETTINGS, sampleRate: 10, disabled: true }),
      NEW_SIGNAL_SETTINGS
    );
  });

  it("writes defined settings over stored metadata and keeps everything else", () => {
    const stored = { sampleRate: 10, reportsEnabled: true, autoResolveEnabled: true };
    assert.deepEqual(writeSignalSettings(stored, { autoResolveEnabled: false, reportsEnabled: undefined }), {
      sampleRate: 10,
      reportsEnabled: true,
      autoResolveEnabled: false,
    });
    assert.deepEqual(stored.autoResolveEnabled, true, "does not mutate its input");
  });
});
