"use client";

import { ArrowLeft, Home } from "lucide-react";
import Image from "next/image";

import icon from "@/assets/logo/icon.png";
import { Button } from "@/components/ui/button.tsx";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="flex flex-col max-w-lg items-center justify-center gap-4 text-secondary-foreground">
        <button
          onClick={() => window.location.assign("/projects")}
          className="flex h-10 mb-8 items-center justify-center"
        >
          <Image alt="Laminar icon" className="rounded-lg" src={icon} width={80} />
        </button>
        <div className="space-y-2">
          <h1 className="text-6xl font-bold text-center text-foreground">404</h1>
          <h2 className="text-2xl font-medium text-center">Page Not Found</h2>
        </div>

        <p className="text-center text-base max-w-md">The page you're looking for doesn't exist or has been moved.</p>
        <div className="flex flex-col sm:flex-row gap-3 mt-4">
          <Button onClick={() => window.history.back()} className="px-4" size="lg" variant="outline">
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
          <Button
            onClick={() => window.location.assign("/projects")}
            className="px-4"
            size="lg"
            variant="outlinePrimary"
          >
            <Home className="mr-2 size-4" />
            Home
          </Button>
        </div>
      </div>
    </div>
  );
}
