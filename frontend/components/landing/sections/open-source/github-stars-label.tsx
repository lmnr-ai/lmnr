"use client";

import { useGitHubStars } from "../../header/github-stars-button";

// The repo's live star count. Abbreviated (3.6k) rather than exact like the
// header badge: this sits in a sentence, where a four-digit figure reads as a
// number to parse rather than a size to register.
const formatStars = (count: number): string => {
  if (count < 1000) return String(count);
  const k = (count / 1000).toFixed(1);
  return `${k.endsWith(".0") ? k.slice(0, -2) : k}k`;
};

// The number is prepended only once it arrives — the unauthenticated GitHub API
// gives a rate-limited or offline visitor nothing — so the label alone still
// reads correctly and still links to the repo.
const GitHubStarsLabel = () => {
  const stars = useGitHubStars("lmnr-ai", "lmnr");
  return <>{stars === null ? "GitHub stars" : `${formatStars(stars)} GitHub stars`}</>;
};

export default GitHubStarsLabel;
