import { SettingsSection, SettingsSectionHeader } from "@/components/settings/settings-section";
import LicenseKeyForm from "@/components/workspace/license/license-key-form";
import LicenseStatusCard from "@/components/workspace/license/license-status-card";
import { type LicenseStatus } from "@/lib/license/types";

interface WorkspaceLicenseProps {
  license: LicenseStatus;
  workspaceId: string;
  isOwner: boolean;
}

const invalidKeyNote = (license: LicenseStatus): string | null => {
  if (license.invalidKeySource === "env") {
    return "LMNR_LICENSE_KEY is set but is not a valid license key, so it is ignored.";
  }
  if (license.invalidKeySource === "database") {
    return "The license key saved in settings could not be verified. Add a new license key.";
  }
  return null;
};

const keyFormBlocker = (license: LicenseStatus, isOwner: boolean): string | null => {
  if (license.licenseSource === "env") {
    return "This license is set by the LMNR_LICENSE_KEY environment variable. Update the variable to change it.";
  }
  if (!isOwner) {
    return "Only workspace owners can add or replace the license key.";
  }
  return null;
};

export default function WorkspaceLicense({ license, workspaceId, isOwner }: WorkspaceLicenseProps) {
  const note = invalidKeyNote(license);
  const blocker = keyFormBlocker(license, isOwner);

  return (
    <>
      <SettingsSection>
        <SettingsSectionHeader
          title="License"
          description="The enterprise license applies to this whole Laminar instance, across every workspace."
        />
        <LicenseStatusCard license={license} />
        {note && <p className="text-xs text-primary">{note}</p>}
        <p className="text-xs text-muted-foreground">
          Enterprise features include Signals, Clusters and Laminar Agent. Full list can be found{" "}
          <a
            href="https://laminar.sh/docs/self-hosting/overview#feature-comparison"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            here
          </a>
          .
        </p>
      </SettingsSection>
      <SettingsSection>
        <SettingsSectionHeader
          size="sm"
          title={license.license ? "Replace license key" : "Add license key"}
          description={license.licenseSource === "env" ? undefined : "Paste the license key you received from Laminar."}
        />
        {blocker ? (
          <p className="text-sm text-muted-foreground">{blocker}</p>
        ) : (
          <LicenseKeyForm workspaceId={workspaceId} hasLicense={!!license.license} />
        )}
        <p className="text-xs text-muted-foreground">
          Need a license or a longer trial? Contact us at{" "}
          <a href="mailto:founders@lmnr.ai" className="text-primary hover:underline">
            founders@lmnr.ai
          </a>
          .
        </p>
      </SettingsSection>
    </>
  );
}
