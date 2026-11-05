import { format } from "date-fns";

import { EE_FEATURES_LABEL } from "@/components/license/license-message";
import { Badge } from "@/components/ui/badge";
import { daysUntil, type LicenseStatus, type LicenseStatusKind, pluralizeDays } from "@/lib/license/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<LicenseStatusKind, { label: string; className: string }> = {
  trial: { label: "Trial", className: "border-primary text-primary" },
  trialExpired: { label: "Trial ended", className: "border-destructive text-destructive" },
  active: { label: "Active", className: "border-green-500 text-green-500" },
  expired: { label: "Expired", className: "border-destructive text-destructive" },
};

const formatDate = (iso: string) => format(new Date(iso), "MMM d, yyyy");

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className="flex gap-4 text-sm">
    <span className="w-32 flex-shrink-0 text-muted-foreground">{label}</span>
    <span className="break-all">{value}</span>
  </div>
);

const summary = (license: LicenseStatus): string => {
  switch (license.status) {
    case "trial":
      return `${EE_FEATURES_LABEL} are enabled for a free trial. They stop when the trial ends unless you add a license key.`;
    case "trialExpired":
      return `The free trial has ended. ${EE_FEATURES_LABEL} are paused until you add a license key.`;
    case "active":
      return `${EE_FEATURES_LABEL} are enabled.`;
    case "expired":
      return `The license has expired. ${EE_FEATURES_LABEL} are paused until you add a new license key.`;
  }
};

export default function LicenseStatusCard({ license }: { license: LicenseStatus }) {
  const badge = STATUS_LABELS[license.status];
  const info = license.license;

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={cn(badge.className)}>
          {badge.label}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground">{summary(license)}</p>
      <div className="flex flex-col gap-1.5">
        {license.trialEndsAt && (
          <Row
            label={license.status === "trial" ? "Trial ends" : "Trial ended"}
            value={`${formatDate(license.trialEndsAt)}${license.status === "trial" ? ` (${pluralizeDays(daysUntil(license.trialEndsAt))} left)` : ""}`}
          />
        )}
        {info && <Row label="Licensed to" value={info.customer} />}
        {info && (
          <Row
            label="Expires"
            value={
              info.expiresAt
                ? `${formatDate(info.expiresAt)}${license.status === "active" ? ` (in ${pluralizeDays(daysUntil(info.expiresAt))})` : ""}`
                : "Never"
            }
          />
        )}
        {info && <Row label="License ID" value={info.licenseId} />}
      </div>
    </div>
  );
}
