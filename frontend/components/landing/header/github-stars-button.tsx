"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { IconGitHub } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

interface GitHubStarsButtonProps {
  owner: string;
  repo: string;
  className?: string;
}

const formatCount = (count: number): string => count.toLocaleString();

export default function GitHubStarsButton({ owner, repo, className }: GitHubStarsButtonProps) {
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

  return (
    <Link
      href={`https://github.com/${owner}/${repo}`}
      target="_blank"
      className={cn(
        "flex items-center h-7 rounded-md overflow-hidden no-underline transition-colors",
        "bg-landing-surface-600 border border-landing-surface-400 hover:bg-landing-surface-500 hover:border-landing-text-400",
        className
      )}
    >
      <div className="flex items-center px-2.5 h-full">
        <IconGitHub className="w-4 h-4 text-landing-text-300" />
      </div>
      {stars !== null && (
        <div className="flex items-center gap-1.5 px-2.5 h-full border-l border-landing-surface-400 bg-landing-surface-700">
          <Star className="w-3.5 h-3.5 text-landing-text-300" />
          <span className="font-sans text-xs font-medium text-landing-text-300">
            {formatCount(stars)}
          </span>
        </div>
      )}
    </Link>
  );
}
