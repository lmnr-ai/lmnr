"use client"; // Error components must be Client Components

import * as Sentry from "@sentry/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useEffect } from "react";

import icon from "@/assets/logo/icon.png";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <Link href={"/projects"} className="flex h-10 mb-8 items-center justify-center">
        <Image alt="Laminar icon" src={icon} width={80} />
      </Link>
      <h1 className="mb-4 text-lg">Oops, something went wrong</h1>
    </div>
  );
}
