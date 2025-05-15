"use client";

import { ProjectApiKey } from "@/lib/api-keys/types";

import Header from "../ui/header";
import DeleteProject from "./delete-project";
import ProjectApiKeys from "./project-api-keys";
import ProviderApiKeys from "./provider-api-keys";
import RenameProject from "./rename-project";

interface SettingsProps {
  apiKeys: ProjectApiKey[];
}

export default function Settings({ apiKeys }: SettingsProps) {
  return (
    <div className="flex flex-col h-full">
      <Header path="settings" />
      <div className="flex flex-col flex-1 space-y-8 p-4 overflow-y-auto">
        <ProjectApiKeys apiKeys={apiKeys} />
        <ProviderApiKeys />
        <RenameProject />
        <DeleteProject />
      </div>
    </div>
  );
}
