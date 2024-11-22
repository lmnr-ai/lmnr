'use client';

import DeleteProject from "./delete-project";
import Header from "../ui/header";
import { ProjectApiKey } from "@/lib/api-keys/types";
import ProjectApiKeys from "./project-api-keys";
import ProviderApiKeys from "./provider-api-keys";

interface SettingsProps {
  apiKeys: ProjectApiKey[];
}

export default function Settings({ apiKeys }: SettingsProps) {
  return (
    <div className="flex flex-col">
      <Header path="settings" />
      <div className="flex flex-col space-y-8 p-4">
        <ProjectApiKeys apiKeys={apiKeys} />
        <ProviderApiKeys />
        <DeleteProject />
      </div>
    </div>
  );
}
