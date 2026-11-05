// Mirrors `LicenseStatus` in app-server/src/license/mod.rs.
export type LicenseStatusKind = "trial" | "trialExpired" | "active" | "expired";

export type LicenseSource = "env" | "database";

export interface LicenseInfo {
  licenseId: string;
  customer: string;
  issuedAt: string;
  // Null for a perpetual license.
  expiresAt: string | null;
}

export interface LicenseStatus {
  status: LicenseStatusKind;
  eeEnabled: boolean;
  trialEndsAt: string | null;
  license: LicenseInfo | null;
  licenseSource: LicenseSource | null;
  invalidKeySource: LicenseSource | null;
}

// Days a paid license warns before it expires.
export const LICENSE_EXPIRY_WARNING_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

export const daysUntil = (iso: string, now: number = Date.now()): number =>
  Math.max(0, Math.ceil((new Date(iso).getTime() - now) / DAY_MS));

export const isLicenseExpiringSoon = (license: LicenseStatus, now: number = Date.now()): boolean =>
  license.status === "active" &&
  !!license.license?.expiresAt &&
  daysUntil(license.license.expiresAt, now) <= LICENSE_EXPIRY_WARNING_DAYS;

export const pluralizeDays = (days: number): string => `${days} ${days === 1 ? "day" : "days"}`;
