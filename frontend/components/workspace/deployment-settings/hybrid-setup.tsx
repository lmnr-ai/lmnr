import { CheckCircle2, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import React, { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button.tsx";
import { CopyButton } from "@/components/ui/copy-button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { DeploymentManagementForm } from "@/components/workspace/deployment-settings/workspace-deployment.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";

interface HybridSetupProps {
  isSaving: boolean;
}

const HybridSetup = ({ isSaving }: HybridSetupProps) => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { watch, setValue } = useFormContext<DeploymentManagementForm>();
  const { toast } = useToast();
  const publicKey = watch("publicKey");
  const dataPlaneUrl = watch("dataPlaneUrl");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);

  const handleGenerateKeys = useCallback(async () => {
    try {
      setIsGenerating(true);
      const response = await fetch(`/api/workspaces/${workspaceId}/deployment/generate-keys`, {
        method: "POST",
      });

      if (!response.ok) {
        const error = (await response.json()) as { error: string };
        toast({ variant: "destructive", title: "Error", description: error.error });
        return;
      }

      const result = (await response.json()) as { publicKey: string };
      setValue("publicKey", result.publicKey);
      toast({ title: "Keys generated successfully" });
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
    } finally {
      setIsGenerating(false);
    }
  }, [setValue, toast, workspaceId]);

  const handleVerifyDeployment = useCallback(async () => {
    try {
      if (!dataPlaneUrl) {
        return;
      }

      setIsVerifying(true);
      const response = await fetch(`/api/workspaces/${workspaceId}/deployment/verify`, {
        method: "POST",
        body: JSON.stringify({ dataPlaneUrl }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error: string };
        toast({ variant: "destructive", title: "Verification failed", description: error.error });
        setIsVerified(false);
        return;
      }

      const result = (await response.json()) as { success: boolean };
      if (result.success) {
        setIsVerified(result.success);
        toast({ title: "Deployment verified successfully" });
      }
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
      setIsVerified(false);
    } finally {
      setIsVerifying(false);
    }
  }, [dataPlaneUrl, toast, workspaceId]);

  return (
    <div className="space-y-6 mt-6">
      <div className="space-y-4">
        <div>
          <Label className="text-base font-medium">API Keys</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Generate keys to authenticate your self-hosted deployment
          </p>
        </div>
        {publicKey ? (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Public Key</Label>
            <div className="flex gap-2 max-w-2xl">
              <Input value={publicKey} readOnly className="font-mono text-sm bg-muted" />
              <CopyButton text={publicKey} />
            </div>
          </div>
        ) : (
          <Button onClick={handleGenerateKeys} disabled={isGenerating}>
            {isGenerating && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            Generate API Keys
          </Button>
        )}
      </div>

      <div className="border-t pt-6 space-y-4">
        <div>
          <Label className="text-base font-medium">Deployment URL</Label>
          <p className="text-sm text-muted-foreground mt-1">Enter your deployment URL and verify connectivity</p>
        </div>
        <div className="flex gap-2 max-w-2xl">
          <Input
            placeholder="https://your-deployment.example.com"
            value={dataPlaneUrl || ""}
            onChange={(e) => {
              setValue("dataPlaneUrl", e.target.value);
              setIsVerified(false);
            }}
            className="flex-1"
          />
          <Button
            variant="outline"
            onClick={handleVerifyDeployment}
            disabled={isVerifying || !dataPlaneUrl}
            className="shrink-0"
          >
            {isVerifying && <Loader2 className="animate-spin h-4 w-4 mr-2" />}
            {isVerified && <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" />}
            {isVerified ? "Verified" : "Verify"}
          </Button>
        </div>
      </div>
    </div>
  );
};

export default HybridSetup;
