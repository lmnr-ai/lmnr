import Link from "next/link";
import { useParams } from "next/navigation";

import { type FeatureItem } from "./banner-data";

interface BannerSlideProps {
  feature: FeatureItem;
}

export default function BannerSlide({ feature }: BannerSlideProps) {
  const { projectId } = useParams();

  return (
    <div
      className="h-[164px] rounded-xl border border-primary/30 flex items-end justify-between pl-6 pr-[18px] py-[18px]"
      style={{
        backgroundImage:
          "linear-gradient(90deg, rgba(208, 113, 73, 0.1) 0%, rgba(208, 113, 73, 0) 60%), linear-gradient(90deg, hsl(var(--secondary)) 0%, hsl(var(--secondary)) 100%)",
      }}
    >
      <div className="flex flex-col gap-2 items-start justify-center w-[476px]">
        <div className="flex flex-col gap-1 items-start w-full">
          <p className="text-xs leading-4 text-primary">{feature.label}</p>
          <p className="text-xl font-medium leading-6 text-foreground">{feature.title}</p>
        </div>
        <p className="text-xs leading-4 text-secondary-foreground">{feature.description}</p>
      </div>
      <div className="flex flex-col items-end justify-center">
        <div className="flex gap-2 items-center">
          <a
            href={feature.docsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="border border-[#555] rounded px-2 py-1 text-xs leading-4 text-foreground hover:bg-muted transition-colors"
          >
            Docs
          </a>
          <Link
            href={`/project/${projectId}/${feature.tryItUrl}`}
            className="bg-primary border border-white/40 rounded px-2 py-1 text-xs leading-4 text-foreground hover:opacity-90 transition-opacity"
          >
            Try it now
          </Link>
        </div>
      </div>
    </div>
  );
}
