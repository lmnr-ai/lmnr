export type ProjectApiKey = {
  shorthand: string;
  projectId: string;
  name?: string;
  id: string;
  isIngestOnly: boolean;
  expiresAt: string | null;
};

export type GenerateProjectApiKeyResponse = {
  value: string;
  name?: string;
  projectId: string;
  shorthand: string;
  isIngestOnly: boolean;
  expiresAt: string | null;
};

export const KEY_EXPIRATION_OPTIONS = [
  { label: "1 day", value: "1" },
  { label: "7 days", value: "7" },
  { label: "30 days", value: "30" },
  { label: "365 days", value: "365" },
  { label: "Never", value: "never" },
] as const;

export type KeyExpiration = (typeof KEY_EXPIRATION_OPTIONS)[number]["value"];
