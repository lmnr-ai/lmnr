import { format } from "date-fns";

import { daysUntil, isLicenseExpiringSoon, type LicenseStatus, pluralizeDays } from "@/lib/license/types";

export const EE_FEATURES_LABEL = "Enterprise features";

export interface LicenseBannerMessage {
  tone: "info" | "warning" | "critical";
  text: string;
  cta: string;
}

const formatDate = (iso: string) => format(new Date(iso), "MMM d, yyyy");

export const getLicenseBannerMessage = (
  license: LicenseStatus,
  now: number = Date.now()
): LicenseBannerMessage | null => {
  switch (license.status) {
    case "trial": {
      const days = license.trialEndsAt ? daysUntil(license.trialEndsAt, now) : 0;
      return {
        tone: days <= 3 ? "warning" : "info",
        text: `Enterprise trial: ${pluralizeDays(days)} left. ${EE_FEATURES_LABEL} stop when the trial ends.`,
        cta: "Add license key",
      };
    }
    case "trialExpired":
      return {
        tone: "critical",
        text: `Your enterprise trial has ended. ${EE_FEATURES_LABEL} are paused until you add a license key.`,
        cta: "Add license key",
      };
    case "expired":
      return {
        tone: "critical",
        text: `Your Laminar license has expired. ${EE_FEATURES_LABEL} are paused until you add a new license key.`,
        cta: "Replace license key",
      };
    case "active": {
      const expiresAt = license.license?.expiresAt;
      if (!expiresAt || !isLicenseExpiringSoon(license, now)) {
        return null;
      }
      return {
        tone: "warning",
        text: `Your Laminar license expires in ${pluralizeDays(daysUntil(expiresAt, now))}, on ${formatDate(expiresAt)}. ${EE_FEATURES_LABEL} stop then.`,
        cta: "Replace license key",
      };
    }
  }
};
