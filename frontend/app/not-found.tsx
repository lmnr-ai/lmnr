import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import icon from "@/assets/logo/icon.png";
import { Button } from "@/components/ui/button.tsx";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen">
      <div className="flex flex-col max-w-lg items-center justify-center gap-4">
        <Link href={"/projects"} className="flex h-10 mb-8 items-center justify-center">
          <Image alt="Laminar icon" className="rounded-lg" src={icon} width={80} />
        </Link>
        <h1 className="text-lg font-medium text-center">404 Page not found</h1>
        <p className="text-secondary-foreground text-center">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link href="/projects" passHref>
          <Button variant="outline">
            Back to Workspace <ArrowRight className="ml-1 size-3.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
