import { CircleAlert } from "lucide-react";
import Link from "next/link";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useProjectContext } from "@/contexts/project-context";

const ProvidersAlert = () => {
  const { settingsHref } = useProjectContext();

  return (
    <Alert>
      <CircleAlert className="size-4" />
      <AlertTitle>No LLM profiles configured</AlertTitle>
      <AlertDescription>
        Add an LLM profile with provider credentials and models in{" "}
        <Link href={settingsHref("llm-profiles")} className="underline">
          workspace settings
        </Link>{" "}
        to start using the playground.
      </AlertDescription>
    </Alert>
  );
};

export default ProvidersAlert;
