"use client";

import * as Sentry from "@sentry/nextjs";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Image from "next/image";
import { useEffect } from "react";

import icon from "@/assets/logo/icon.png";
import { Button } from "@/components/ui/button.tsx";

interface ErrorPageProps {
  error: Error & { digest?: string };
  backAction: () => void;
  backLabel: string;
}

export default function ErrorPage({ error, backAction, backLabel }: ErrorPageProps) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="flex flex-col max-w-lg items-center justify-center gap-4 text-secondary-foreground">
        <button
          onClick={() => {
            window.location.href = "/projects";
          }}
          className="flex h-10 mb-8 items-center justify-center"
        >
          <Image alt="Laminar icon" className="rounded-lg" src={icon} width={80} />
        </button>
        <h1 className="text-2xl font-medium text-center">Oops, something went wrong</h1>
        <h1 className="font-medium text-center text-destructive">{error?.name}</h1>

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Button onClick={backAction} className="px-4" size="lg" variant="outline">
            <ArrowLeft className="mr-2 size-4" />
            {backLabel}
          </Button>
          <Button
            onClick={() => {
              window.location.reload();
            }}
            className="px-4"
            size="lg"
            variant="outlinePrimary"
          >
            <RefreshCw className="mr-2 size-4" />
            Try again
          </Button>
        </div>
      </div>
    </div>
  );
}
