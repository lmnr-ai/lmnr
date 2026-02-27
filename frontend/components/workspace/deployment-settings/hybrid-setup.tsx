import { CheckCircle2, CircleDot, ExternalLink, Loader2 } from "lucide-react";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";
import { useFormContext } from "react-hook-form";

import { Button } from "@/components/ui/button.tsx";
import { CopyButton } from "@/components/ui/copy-button.tsx";
import { Input } from "@/components/ui/input.tsx";
import { Label } from "@/components/ui/label.tsx";
import { type DeploymentManagementForm } from "@/components/workspace/deployment-settings/workspace-deployment.tsx";
import { useToast } from "@/lib/hooks/use-toast.ts";
import { cn } from "@/lib/utils.ts";

interface HybridSetupProps {
  isSaving: boolean;
  isVerified: boolean;
  onVerifiedChange: (verified: boolean) => void;
}

const HybridSetup = ({ isSaving, isVerified, onVerifiedChange }: HybridSetupProps) => {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { watch, setValue } = useFormContext<DeploymentManagementForm>();
  const { toast } = useToast();
  const publicKey = watch("publicKey");
  const dataPlaneUrl = watch("dataPlaneUrl");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

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
        onVerifiedChange(false);
        return;
      }

      const result = (await response.json()) as { success: boolean };
      if (result.success) {
        onVerifiedChange(true);
        toast({ title: "Deployment verified successfully" });
      }
    } catch (e) {
      if (e instanceof Error) {
        toast({ variant: "destructive", title: "Error", description: e.message });
      }
      onVerifiedChange(false);
    } finally {
      setIsVerifying(false);
    }
  }, [dataPlaneUrl, toast, workspaceId, onVerifiedChange]);

  const keysComplete = Boolean(publicKey);
  const urlComplete = isVerified;

  return (
    <div className="space-y-4">
      {/* How hybrid works */}
      <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
        <p className="text-sm font-medium">How hybrid deployment works</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Your data is processed through Laminar Cloud, but we never store it. We route writes to services running in{" "}
          <strong>your</strong> infrastructure, which persist to a database in <strong>your</strong> cloud.
        </p>
        <div className="flex items-center gap-4 pt-1">
          <a
            href="https://github.com/lmnr-ai/lmnr-hybrid-deploy"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Deployment guide
          </a>
        </div>
      </div>

      {/* Setup steps */}
      <div className="rounded-lg border divide-y">
        {/* Step 1: API Keys */}
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <StepIndicator step={1} isComplete={keysComplete} isActive={!keysComplete} />
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium">Generate API keys</Label>
              <div className="text-xs text-muted-foreground mt-0.5">
                This public key is used to generate a signed token that authenticates your data plane with Laminar.{" "}
                <br />
                It will be used during the deployment of data plane services.
              </div>
            </div>
          </div>
          {publicKey ? (
            <div className="ml-9 space-y-1.5">
              <Label className="text-xs text-muted-foreground">Public Key</Label>
              <div className="flex gap-2 max-w-xl">
                <Input value={publicKey} readOnly className="font-mono text-xs bg-muted h-8" />
                <CopyButton text={publicKey} />
              </div>
            </div>
          ) : (
            <div className="ml-9">
              <Button variant="outline" size="sm" onClick={handleGenerateKeys} disabled={isGenerating || isSaving}>
                {isGenerating && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
                Generate keys
              </Button>
            </div>
          )}
        </div>

        {/* Step 2: Deployment URL */}
        <div className={cn("p-4 space-y-3", !keysComplete && "opacity-50 pointer-events-none")}>
          <div className="flex items-start gap-3">
            <StepIndicator step={2} isComplete={urlComplete} isActive={keysComplete && !urlComplete} />
            <div className="flex-1 min-w-0">
              <Label className="text-sm font-medium">Verify deployment URL</Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Enter your data plane URL and verify that Laminar can reach it.
              </p>
            </div>
          </div>
          <div className="ml-9 flex gap-2 max-w-xl">
            <Input
              placeholder="https://your-deployment.example.com"
              value={dataPlaneUrl || ""}
              onChange={(e) => {
                setValue("dataPlaneUrl", e.target.value);
                onVerifiedChange(false);
              }}
              disabled={isSaving}
              className="flex-1 h-8 text-sm"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleVerifyDeployment}
              disabled={isVerifying || !dataPlaneUrl || isSaving}
              className="shrink-0"
            >
              {isVerifying && <Loader2 className="animate-spin h-3.5 w-3.5 mr-1.5" />}
              {isVerified && <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-600" />}
              {isVerified ? "Verified" : "Verify"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ── Step indicator ──────────────────────────────────────────────────────

function StepIndicator({ step, isComplete, isActive }: { step: number; isComplete: boolean; isActive: boolean }) {
  if (isComplete) {
    return (
      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-green-600 text-white mt-0.5 shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5" />
      </div>
    );
  }

  if (isActive) {
    return (
      <div className="flex items-center justify-center h-5 w-5 rounded-full bg-primary text-primary-foreground mt-0.5 shrink-0">
        <CircleDot className="h-3.5 w-3.5" />
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center h-5 w-5 rounded-full border border-muted-foreground/30 text-muted-foreground text-[10px] font-medium mt-0.5 shrink-0">
      {step}
    </div>
  );
}

export default HybridSetup;
