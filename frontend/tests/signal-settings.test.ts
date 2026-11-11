import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { NEW_SIGNAL_SETTINGS, readSignalSettings, writeSignalSettings } from "@/lib/signals/settings";

describe("signal settings", () => {
  it("reads a missing or non-boolean setting as off", () => {
    assert.deepEqual(readSignalSettings(null), { reportsEnabled: false, resolvingEnabled: false });
    assert.deepEqual(readSignalSettings({ reportsEnabled: true, resolvingEnabled: "yes" }), {
      reportsEnabled: true,
      resolvingEnabled: false,
    });
  });

  it("reads only the settings, not other metadata", () => {
    assert.deepEqual(
      readSignalSettings({ ...NEW_SIGNAL_SETTINGS, sampleRate: 10, disabled: true }),
      NEW_SIGNAL_SETTINGS
    );
  });

  it("writes defined settings over stored metadata and keeps everything else", () => {
    const stored = { sampleRate: 10, reportsEnabled: true, resolvingEnabled: true };
    assert.deepEqual(writeSignalSettings(stored, { resolvingEnabled: false, reportsEnabled: undefined }), {
      sampleRate: 10,
      reportsEnabled: true,
      resolvingEnabled: false,
    });
    assert.deepEqual(stored.resolvingEnabled, true, "does not mutate its input");
  });
});
