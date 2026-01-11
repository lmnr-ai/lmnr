"use client";

import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Button } from "@/components/ui/button.tsx";
import CodeHighlighter from "@/components/ui/code-highlighter.tsx";
import { type GenerateProjectApiKeyResponse } from "@/lib/api-keys/types.ts";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { cn } from "@/lib/utils.ts";

interface ApiKeyGeneratorProps {
  context: "traces" | "evaluations";
  title?: string;
}

export default function ApiKeyGenerator({ context, title = "Get your API Key" }: ApiKeyGeneratorProps) {
  const { projectId } = useParams();
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  const apiKeyName = `${context}-setup-api-key`;
  const displayValue = generatedKey ? `LMNR_PROJECT_API_KEY=${generatedKey}` : "LMNR_PROJECT_API_KEY=<your_api_key>";

  const handleGenerateKey = async () => {
    try {
      setIsLoading(true);
      const res = await fetch(`/api/projects/${projectId}/api-keys`, {
        method: "POST",
        body: JSON.stringify({
          name: apiKeyName,
          isIngestOnly: false,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to generate API key");
      }

      const data = (await res.json()) as GenerateProjectApiKeyResponse;
      setGeneratedKey(data.value);
    } catch (error) {
      console.error("Error generating API key:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate API key. Please try again.",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-medium">{title}</h2>
        {!generatedKey && (
          <Button onClick={handleGenerateKey} disabled={isLoading}>
            <Loader2 className={cn("mr-2 hidden", isLoading ? "animate-spin block" : "")} size={14} />
            Generate
          </Button>
        )}
      </div>
      <CodeHighlighter
        className="text-xs bg-background p-4 rounded-md border [&_code]:break-all"
        copyable
        code={displayValue}
      />
    </div>
  );
}
