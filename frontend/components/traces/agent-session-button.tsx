import { Pause } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import useSWR from "swr";

import { swrFetcher } from "@/lib/utils";

import { Button } from "../ui/button";

interface AgentSessionButtonProps {
  sessionId: string;
}

export function AgentSessionButton({ sessionId }: AgentSessionButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const { projectId } = useParams();

  const { data: agentSession } = useSWR(`/api/projects/${projectId}/agent-session/${sessionId}`, swrFetcher);

  const isActive = agentSession?.status !== "idle";

  if (!isActive) {
    return null;
  }

  const handleCancelAgentRun = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/agent-session/stop`, {
        method: "POST",
        body: JSON.stringify({ sessionId }),
      });

      if (response.ok) {
      }
    } catch (error) {
      console.error("Error canceling agent run:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button variant="secondary" onClick={handleCancelAgentRun} disabled={isLoading || !isActive}>
      <Pause size={16} className="mr-2" />
      Cancel agent run
    </Button>
  );
}
