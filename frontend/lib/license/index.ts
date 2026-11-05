import { cache } from "react";

import { callAppServer } from "@/lib/api/backend";
import { decryptValue } from "@/lib/crypto";
import { db } from "@/lib/db/drizzle";
import { instanceLicense } from "@/lib/db/migrations/schema";
import { Feature, isFeatureEnabled } from "@/lib/features/features";
import { isLicenseExpired, verifyLicense } from "@/lib/license/format";
import { type LicenseStatus } from "@/lib/license/types";

// Must match ENCRYPTION_AAD in app-server/src/license/mod.rs, which encrypts the key.
const ENCRYPTION_AAD = "instance_license";

const backendLicenseUrl = () => `${process.env.BACKEND_URL}/api/v1/license`;

// The app-server owns license state. Returns null where licensing doesn't apply:
// an OSS app-server (no route, 404) or Laminar Cloud, which carries its own
// license and must not show instance license UI to workspace owners.
export const getLicenseStatus = cache(async (): Promise<LicenseStatus | null> => {
  if (isFeatureEnabled(Feature.LAMINAR_CLOUD)) {
    return null;
  }
  try {
    const res = await fetch(backendLicenseUrl(), { cache: "no-store" });
    if (res.status === 404) {
      return null;
    }
    if (!res.ok) {
      console.error(`Failed to fetch license status: ${res.status} ${await res.text()}`);
      return null;
    }
    return (await res.json()) as LicenseStatus;
  } catch (error) {
    console.error("Failed to fetch license status:", error);
    return null;
  }
});

// Like the app-server's is_ee_enabled, fails open: no answer (OSS, Cloud, an unreachable app-server) counts as enabled.
export const isEeEnabled = async (): Promise<boolean> => (await getLicenseStatus())?.eeEnabled ?? true;

export const saveLicenseKey = (key: string, userId: string) =>
  callAppServer<LicenseStatus>("/license", { method: "PUT", body: { key, userId } });

export const getTrialStartedAt = async (): Promise<string | null> => {
  const [row] = await db.select({ trialStartedAt: instanceLicense.trialStartedAt }).from(instanceLicense).limit(1);
  return row?.trialStartedAt ?? null;
};

const getStoredLicenseKey = async (): Promise<string | null> => {
  const [row] = await db
    .select({ key: instanceLicense.licenseKey, nonce: instanceLicense.licenseKeyNonce })
    .from(instanceLicense)
    .limit(1);
  if (!row?.key || !row.nonce) {
    return null;
  }
  return decryptValue(ENCRYPTION_AAD, row.nonce, row.key);
};

// Bearer for the Cloud Slack broker, in the app-server's precedence: an env license
// that verifies, then one saved in settings. An env value that doesn't verify must
// not shadow a working stored key. An expired license gives no bearer, so the
// connect UI stays hidden instead of failing at the broker.
export const getBrokerLicenseKey = async (): Promise<string | null> => {
  const envKey = process.env.LMNR_LICENSE_KEY?.trim() || null;
  const envLicense = envKey ? verifyLicense(envKey) : null;
  if (envLicense) {
    return isLicenseExpired(envLicense) ? null : envKey;
  }
  const storedKey = await getStoredLicenseKey().catch((error) => {
    console.error("Failed to read the stored license key:", error);
    return null;
  });
  const storedLicense = storedKey ? verifyLicense(storedKey) : null;
  return storedLicense && !isLicenseExpired(storedLicense) ? storedKey : null;
};
