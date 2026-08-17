"use client";

import { useGitHubStars } from "../../header/github-stars-button";

// The repo's live star count, as the first feature row's label.
//
// Abbreviated (3.6k) rather than exact (3,177) like the header badge: this sits
// in a sentence, where a precise four-digit figure reads as a number to parse
// rather than a size to register. Trailing .0 is dropped so a round count is
// "4k", not "4.0k".
const formatStars = (count: number): string => {
  if (count < 1000) return String(count);
  const k = (count / 1000).toFixed(1);
  return `${k.endsWith(".0") ? k.slice(0, -2) : k}k`;
};

// "GitHub stars" is the stable part and the number is prepended only once it
// arrives: the count comes from the unauthenticated GitHub API, so a visitor who
// is rate-limited, offline, or behind a proxy that blocks api.github.com never
// gets one. Rendering the label alone leaves the row reading correctly and still
// linking to the repo, rather than blank.
const GitHubStarsLabel = () => {
  const stars = useGitHubStars("lmnr-ai", "lmnr");
  return <>{stars === null ? "GitHub stars" : `${formatStars(stars)} GitHub stars`}</>;
};

export default GitHubStarsLabel;
