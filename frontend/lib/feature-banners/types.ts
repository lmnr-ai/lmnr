export interface FeatureBanner {
  /** Human-readable slug, e.g. "sql-editor". */
  id: string;
  title: string;
  description: string;
  image_src: string;
  /** Markdown shown in the details modal. The banner is not clickable without it. */
  long_description?: string;
  open_source: boolean;
  /** ISO timestamp. */
  created_at: string;
  /** ISO timestamp after which the banner is no longer shown. */
  expires_at: string;
}

export const isBannerActive = (banner: FeatureBanner, now: Date = new Date()) =>
  new Date(banner.expires_at).getTime() > now.getTime();
