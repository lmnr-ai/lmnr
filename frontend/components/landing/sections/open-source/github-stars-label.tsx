"use client";

import { formatCount, useGitHubStars } from "../../header/github-stars-button";

// The repo's live star count, as the first feature row's label.
//
// "GitHub stars" is the stable part and the number is prepended only once it
// arrives: the count comes from the unauthenticated GitHub API, so a visitor who
// is rate-limited, offline, or behind a proxy that blocks api.github.com never
// gets one. Rendering the label alone leaves that row reading correctly and
// still linking to the repo, rather than blank.
const GitHubStarsLabel = () => {
  const stars = useGitHubStars("lmnr-ai", "lmnr");
  return <>{stars === null ? "GitHub stars" : `${formatCount(stars)} GitHub stars`}</>;
};

export default GitHubStarsLabel;
