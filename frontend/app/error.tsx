"use client"; // Error components must be Client Components

import * as Sentry from "@sentry/nextjs";
import { ArrowLeft, RefreshCw } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

import icon from "@/assets/logo/icon.png";
import { Button } from "@/components/ui/button.tsx";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="flex flex-col max-w-lg items-center justify-center gap-4 text-secondary-foreground">
        <Link href={"/projects"} className="flex h-10 mb-8 items-center justify-center">
          <Image alt="Laminar icon" className="rounded-lg" src={icon} width={80} />
        </Link>
        <h1 className="text-2xl font-medium text-center">Oops, something went wrong</h1>
        <h1 className="font-medium text-center text-destructive">{error?.name}</h1>

        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Button onClick={router.back} className="px-4" size="lg" variant="outline">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
          <Button onClick={router.refresh} className="px-4" size="lg" variant="outlinePrimary">
            <RefreshCw className="mr-2 size-4" />
            Try Again
          </Button>
        </div>
      </div>
    </div>
  );
}
