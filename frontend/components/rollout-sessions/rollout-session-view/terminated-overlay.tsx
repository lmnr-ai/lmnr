"use client";

import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function SessionTerminatedOverlay() {
  const { projectId } = useParams();

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
      <Card className="max-w-md w-full mx-4">
        <CardHeader className="text-center space-y-4">
          <div className="mx-auto w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <CardTitle className="text-xl">Session Terminated</CardTitle>
          <CardDescription className="text-sm">
            This rollout session has been terminated externally. All running operations have been stopped.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2 justify-center">
            <Link href={`/project/${projectId}/rollout-sessions`} passHref>
              <Button variant="secondary" className="flex-1 hover:text-accent-foreground/80">
                Back to Sessions List
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
