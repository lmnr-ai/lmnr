export type ProjectApiKey = {
  shorthand: string
  projectId: string
  name?: string
  id: string
}

export type GenerateProjectApiKeyResponse = {
  value: string
  name?: string
  projectId: string
  shorthand: string
}
