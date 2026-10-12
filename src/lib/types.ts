/**
 * Content model shared by the public site, the admin panel and the API routes.
 * Stored as JSON inside `ml_site.draft` / `ml_site.published`.
 */

export type MediaKind = "image" | "video";
export type MediaScope = "project" | "site";

export type MediaItem = {
  id: string;
  projectId: string | null;
  scope: MediaScope;
  kind: MediaKind;
  bucket: string;
  path: string;
  posterPath: string | null;
  /** Video poster expressed as a second offset (Media Fragment URI). */
  posterTime: number | null;
  alt: string;
  caption: string | null;
  year: number | null;
  width: number | null;
  height: number | null;
  durationS: number | null;
  bytes: number | null;
  mime: string | null;
  order: number;
  /** Resolved on the server: public URL of `path`. */
  url?: string;
  posterUrl?: string | null;
};

export type ProjectStatus = "draft" | "published";

export type Project = {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  year: number | null;
  category: string;
  excerpt: string | null;
  description: string | null;
  client: string | null;
  location: string | null;
  externalUrl: string | null;
  status: ProjectStatus;
  order: number;
  featured: boolean;
  featuredRank: number | null;
  publishedAt: string | null;
  updatedAt: string;
  /** Media chosen as the project cover (card/hero of the detail page). */
  coverMediaId: string | null;
  media: MediaItem[];
};

export type TimelineKind =
  | "exhibition"
  | "collaboration"
  | "milestone"
  | "press"
  | "residency";

export type TimelineEntry = {
  id: string;
  yearLabel: string;
  sortYear: number | null;
  sortMonth: number | null;
  title: string;
  kind: TimelineKind;
  place: string | null;
  description: string | null;
  linkUrl: string | null;
  mediaId: string | null;
  status: ProjectStatus;
  order: number;
  media?: MediaItem | null;
};

export type SocialLink = { label: string; href: string };
export type Fact = { label: string; value: string };

export type SiteContent = {
  /** True while the copy is still the provisional seed shipped with the site. */
  provisional: boolean;
  meta: {
    siteTitle: string;
    tagline: string;
    description: string;
    ogMediaId: string | null;
  };
  hero: {
    eyebrow: string;
    title: string;
    subtitle: string;
    ctaPrimaryLabel: string;
    ctaPrimaryHref: string;
    ctaSecondaryLabel: string;
    ctaSecondaryHref: string;
    /** Hero artwork: image or (muted, looped) video. */
    mediaId: string | null;
    /** Still shown before/without the hero video. */
    posterMediaId: string | null;
  };
  featured: {
    title: string;
    intro: string;
    projectIds: string[];
  };
  works: {
    title: string;
    intro: string;
    categories: string[];
  };
  bio: {
    title: string;
    portraitMediaId: string | null;
    intro: string;
    body: string;
    visionTitle: string;
    vision: string;
    minglesTitle: string;
    mingles: string;
    facts: Fact[];
    socials: SocialLink[];
  };
  career: {
    title: string;
    intro: string;
    emptyNote: string;
  };
  mint: {
    title: string;
    eyebrow: string;
    intro: string;
    body: string;
    disclaimer: string;
    consentText: string;
    open: boolean;
    closedMessage: string;
  };
  footer: {
    note: string;
    socials: SocialLink[];
  };
  updatedAt: string;
};

export type SiteDocument = {
  content: SiteContent;
  projects: Project[];
  timeline: TimelineEntry[];
  media: MediaItem[];
};

export type MintInterestInput = {
  email: string;
  walletAddress: string | null;
  walletChainId: number | null;
  walletSource: "manual" | "walletconnect" | "injected" | null;
  consent: boolean;
  consentText: string;
  source: string | null;
  referrer: string | null;
  locale: string | null;
  honeypot: string;
  elapsedMs: number | null;
};

export type MintInterestRecord = {
  id: string;
  email: string;
  walletAddress: string | null;
  walletChainId: number | null;
  walletSource: string | null;
  consent: boolean;
  consentAt: string;
  source: string | null;
  createdAt: string;
  note: string | null;
};
