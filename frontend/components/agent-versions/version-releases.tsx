import { Badge } from "@/components/ui/badge";

/** Releases past this many collapse into a count. */
const SHOWN_RELEASES = 10;

export default function VersionReleases({ releases }: { releases: string[] }) {
  const hidden = releases.length - SHOWN_RELEASES;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {releases.slice(0, SHOWN_RELEASES).map((release) => (
        <Badge key={release} variant="outline" className="h-5 font-mono font-normal text-muted-foreground">
          {release}
        </Badge>
      ))}
      {hidden > 0 && <span className="text-xs text-muted-foreground">+{hidden} more</span>}
    </div>
  );
}
