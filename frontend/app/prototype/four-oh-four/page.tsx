// PROTOTYPE — throwaway route for tuning the 404 page concept.
"use client";

import { useDialKit } from "dialkit";
import { ArrowLeft, Home } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { Button, type ButtonProps } from "@/components/ui/button";

import FourOhFourScene from "./scene";

export default function FourOhFourPrototypePage() {
  const router = useRouter();
  const { layoutGap, buttonSize, horizontalPadding } = useDialKit(
    "404 actions",
    {
      layoutGap: [43, 0, 80, 1],
      buttonSize: {
        type: "select" as const,
        options: [
          { label: "Medium", value: "md" },
          { label: "Large", value: "lg" },
        ],
        default: "lg",
      },
      horizontalPadding: [16, 4, 48, 1],
    },
    { id: "four-oh-four-actions-v4", persist: true }
  );
  const size = buttonSize as ButtonProps["size"];

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#0b0b0c] px-6 py-12 text-white">
      <div className="flex w-full max-w-[560px] flex-col items-center" style={{ gap: layoutGap }}>
        <FourOhFourScene />
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size={size}
            onClick={() => router.back()}
            style={{ paddingInline: horizontalPadding }}
            className="bg-transparent hover:bg-surface-up-2 active:bg-surface-up-4"
          >
            <ArrowLeft className="mr-2 size-4" />
            Back
          </Button>
          <Button
            asChild
            variant="outline"
            size={size}
            style={{ paddingInline: horizontalPadding }}
            className="bg-transparent hover:bg-surface-up-2 active:bg-surface-up-4"
          >
            <Link href="/">
              <Home className="mr-2 size-4" />
              Home
            </Link>
          </Button>
        </div>
      </div>
    </main>
  );
}
