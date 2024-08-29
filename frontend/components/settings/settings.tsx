'use client';

import { ProjectApiKey } from "@/lib/api-keys/types"
import Header from "../ui/header";
import ProjectApiKeys from "./project-api-keys";
import DeleteProject from "./delete-project";
import DevSessions from "./dev-sessions";

interface SettingsProps {
  apiKeys: ProjectApiKey[]
}

export default function Settings({ apiKeys }: SettingsProps) {
  return (
    <div className="flex flex-col p-4 space-y-8">
      <Header path="settings" />
      <ProjectApiKeys apiKeys={apiKeys} />
      <DevSessions />
      <DeleteProject />
    </div>
  )
}
