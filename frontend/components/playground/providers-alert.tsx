import { CircleAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const ProvidersAlert = () => {
  const params = useParams();

  return (
    <Alert>
      <CircleAlert className="size-4" />
      <AlertTitle>No providers are configured</AlertTitle>
      <AlertDescription>
        Please configure at least one AI provider in{" "}
        <Link href={`/project/${params?.projectId}/settings`} className="underline">
          settings
        </Link>{" "}
        to start using the playground.
      </AlertDescription>
    </Alert>
  );
};

export default ProvidersAlert;
