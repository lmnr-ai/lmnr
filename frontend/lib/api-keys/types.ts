export type ProjectApiKey = {
  shorthand: string;
  projectId: string;
  name?: string;
  id: string;
  isIngestOnly?: boolean;
};

export type GenerateProjectApiKeyResponse = {
  value: string;
  name?: string;
  projectId: string;
  shorthand: string;
  isIngestOnly?: boolean;
};
