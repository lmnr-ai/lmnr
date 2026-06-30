"use client";

import Link from "next/link";

import { useFeatureFlags } from "@/contexts/feature-flags-context";
import { Feature } from "@/lib/features/features";

export function AuthFooter() {
  const enableCredentials = useFeatureFlags()[Feature.EMAIL_AUTH];

  if (enableCredentials) return null;

  return (
    <footer className="p-6 flex justify-center">
      <div className="text-sm font-medium text-white/70">
        By continuing you agree to our{" "}
        <Link href="/policies/privacy" target="_blank" rel="noopener noreferer" className="text-white">
          Privacy Policy
        </Link>{" "}
        and{" "}
        <Link href="/policies/terms" target="_blank" rel="noopener noreferer" className="text-white">
          Terms of Service
        </Link>
      </div>
    </footer>
  );
}
