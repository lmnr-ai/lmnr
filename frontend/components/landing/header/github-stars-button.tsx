"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { IconGitHub } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface GitHubStarsButtonProps {
  owner: string;
  repo: string;
  className?: string;
}

/** Header-local: the badge has room for the exact figure. The landing feature
 *  row abbreviates instead, so this is deliberately NOT shared. */
const formatCount = (count: number): string => count.toLocaleString();

/** A repo's live star count, or null. Unauthenticated GitHub API, so a
 *  rate-limited or offline visitor never gets one — null is a permanent state
 *  every caller has to render for, not a brief loading one. */
export const useGitHubStars = (owner: string, repo: string): number | null => {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
        if (response.ok) {
          const data = await response.json();
          setStars(data.stargazers_count);
        }
      } catch (error) {
        console.error("Failed to fetch GitHub stars:", error);
      }
    };

    fetchStars();
  }, [owner, repo]);

  return stars;
};

export default function GitHubStarsButton({ owner, repo, className }: GitHubStarsButtonProps) {
  const stars = useGitHubStars(owner, repo);

  return (
    <Link
      href={`https://github.com/${owner}/${repo}`}
      target="_blank"
      className={cn(
        "flex items-center h-7 gap-2 rounded-md overflow-hidden no-underline transition-colors group",
        className
      )}
    >
      <div className="flex items-center h-full">
        <IconGitHub className="w-4 h-4 text-foreground-300 group-hover:text-foreground-50" />
      </div>
      {stars !== null && (
        <span className="font-sans text-xs font-medium text-foreground-300 group-hover:text-foreground-50">
          {formatCount(stars)}
        </span>
      )}
    </Link>
  );
}
