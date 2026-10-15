import { cleanHref, cleanOptionalText, cleanText, cleanUrl } from "@/lib/validation";
import { previewContent } from "@/lib/preview-content";
import type {
  Fact,
  NftItem,
  Project,
  SiteContent,
  SocialLink,
  TimelineEntry,
  TimelineKind,
} from "@/lib/types";

/**
 * Payload sanitisers. Pure functions, used by the admin API routes before any
 * write, and unit-tested in `tests/content.test.mjs`. Anything unexpected coming
 * from the browser is dropped rather than stored.
 */

const TIMELINE_KINDS: TimelineKind[] = [
  "exhibition",
  "collaboration",
  "milestone",
  "press",
  "residency",
];

function stringList(input: unknown, max = 40): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, max);
}

function socials(input: unknown): SocialLink[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const href = cleanUrl(record.href);
      const label = cleanText(record.label, 40);
      if (!href || !label) return null;
      return { label, href };
    })
    .filter((value): value is SocialLink => value !== null)
    .slice(0, 12);
}

function facts(input: unknown): Fact[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const label = cleanText(record.label, 60);
      const value = cleanText(record.value, 240);
      if (!label || !value) return null;
      return { label, value };
    })
    .filter((value): value is Fact => value !== null)
    .slice(0, 12);
}

export function sanitizeSiteContent(input: unknown): SiteContent {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const base = previewContent;

  const meta = (raw.meta ?? {}) as Record<string, unknown>;
  const hero = (raw.hero ?? {}) as Record<string, unknown>;
  const featured = (raw.featured ?? {}) as Record<string, unknown>;
  const works = (raw.works ?? {}) as Record<string, unknown>;
  const bio = (raw.bio ?? {}) as Record<string, unknown>;
  const career = (raw.career ?? {}) as Record<string, unknown>;
  const mint = (raw.mint ?? {}) as Record<string, unknown>;
  const footer = (raw.footer ?? {}) as Record<string, unknown>;

  return {
    provisional: raw.provisional === false ? false : true,
    meta: {
      siteTitle: cleanText(meta.siteTitle, 120) || base.meta.siteTitle,
      tagline: cleanText(meta.tagline, 160),
      description: cleanText(meta.description, 320),
      ogMediaId: cleanOptionalText(meta.ogMediaId, 60),
    },
    hero: {
      eyebrow: cleanText(hero.eyebrow, 80),
      title: cleanText(hero.title, 120) || base.hero.title,
      subtitle: cleanText(hero.subtitle, 400),
      ctaPrimaryLabel: cleanText(hero.ctaPrimaryLabel, 40),
      ctaPrimaryHref: cleanHref(hero.ctaPrimaryHref, "/works"),
      ctaSecondaryLabel: cleanText(hero.ctaSecondaryLabel, 40),
      ctaSecondaryHref: cleanHref(hero.ctaSecondaryHref, "/mint"),
      mediaId: cleanOptionalText(hero.mediaId, 60),
      posterMediaId: cleanOptionalText(hero.posterMediaId, 60),
      studioLabel: cleanText(hero.studioLabel, 60) || base.hero.studioLabel,
    },
    featured: {
      title: cleanText(featured.title, 120) || base.featured.title,
      intro: cleanText(featured.intro, 400),
      projectIds: stringList(featured.projectIds, 12),
    },
    works: {
      title: cleanText(works.title, 120) || base.works.title,
      intro: cleanText(works.intro, 400),
      categories: stringList(works.categories, 20).map((value) => value.toLowerCase()),
    },
    bio: {
      title: cleanText(bio.title, 120) || base.bio.title,
      portraitMediaId: cleanOptionalText(bio.portraitMediaId, 60),
      artworkMediaId: cleanOptionalText(bio.artworkMediaId, 60),
      intro: cleanText(bio.intro, 400),
      body: cleanText(bio.body, 8000),
      visionTitle: cleanText(bio.visionTitle, 120) || base.bio.visionTitle,
      vision: cleanText(bio.vision, 4000),
      collabTitle: cleanText(bio.collabTitle, 120) || base.bio.collabTitle,
      collab: cleanText(bio.collab, 4000),
      facts: facts(bio.facts),
      socials: socials(bio.socials),
    },
    nfts: sanitizeNfts(raw.nfts),
    career: {
      title: cleanText(career.title, 120) || base.career.title,
      intro: cleanText(career.intro, 400),
      emptyNote: cleanText(career.emptyNote, 300) || base.career.emptyNote,
    },
    mint: {
      title: cleanText(mint.title, 120) || base.mint.title,
      eyebrow: cleanText(mint.eyebrow, 80),
      intro: cleanText(mint.intro, 400),
      body: cleanText(mint.body, 2000),
      disclaimer: cleanText(mint.disclaimer, 600) || base.mint.disclaimer,
      consentText: cleanText(mint.consentText, 240) || base.mint.consentText,
      open: mint.open !== false,
      closedMessage: cleanText(mint.closedMessage, 300) || base.mint.closedMessage,
    },
    footer: {
      note: cleanText(footer.note, 240),
      socials: socials(footer.socials),
    },
    updatedAt: new Date().toISOString(),
  };
}

/** Keeps the NFT list well-formed and free of half-written entries. */
export function sanitizeNfts(input: unknown): { title: string; eyebrow: string; intro: string; note: string; items: NftItem[] } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const list = Array.isArray(raw.items) ? raw.items : [];

  const items: NftItem[] = list
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const title = cleanText(record.title, 160);
      const mediaId = cleanOptionalText(record.mediaId, 60);
      // An entry with neither a title nor an image is not a piece yet.
      if (!title && !mediaId) return null;
      const year = Number(record.year);
      return {
        id: cleanText(record.id, 60) || `nft-${index + 1}`,
        title: title || "Untitled",
        description: cleanOptionalText(record.description, 2000),
        mediaId,
        year: Number.isFinite(year) && year > 1800 && year < 2200 ? Math.round(year) : null,
        edition: cleanOptionalText(record.edition, 80),
        linkUrl: cleanUrl(record.linkUrl),
      } satisfies NftItem;
    })
    .filter((item): item is NftItem => item !== null)
    .slice(0, 200);

  return {
    title: cleanText(raw.title, 120) || previewContent.nfts.title,
    eyebrow: cleanText(raw.eyebrow, 80),
    intro: cleanText(raw.intro, 600),
    note: cleanText(raw.note, 1200),
    items,
  };
}

export type ProjectInput = Omit<Project, "media" | "updatedAt" | "publishedAt"> & {
  publishedAt?: string | null;
};

export function sanitizeProject(input: unknown): ProjectInput {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const year = Number(raw.year);
  return {
    id: cleanText(raw.id, 60),
    slug: cleanText(raw.slug, 80),
    title: cleanText(raw.title, 160),
    subtitle: cleanOptionalText(raw.subtitle, 160),
    year: Number.isFinite(year) && year > 1800 && year < 2200 ? Math.round(year) : null,
    category: cleanText(raw.category, 40).toLowerCase() || "work",
    excerpt: cleanOptionalText(raw.excerpt, 400),
    description: cleanOptionalText(raw.description, 12000),
    client: cleanOptionalText(raw.client, 160),
    location: cleanOptionalText(raw.location, 160),
    externalUrl: cleanUrl(raw.externalUrl),
    status: raw.status === "published" ? "published" : "draft",
    order: Number.isFinite(Number(raw.order)) ? Math.round(Number(raw.order)) : 0,
    featured: raw.featured === true,
    featuredRank: Number.isFinite(Number(raw.featuredRank))
      ? Math.round(Number(raw.featuredRank))
      : null,
    coverMediaId: cleanOptionalText(raw.coverMediaId, 60),
  };
}

export function sanitizeTimeline(input: unknown): Omit<TimelineEntry, "media"> {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const sortYear = Number(raw.sortYear);
  const sortMonth = Number(raw.sortMonth);
  const kind = TIMELINE_KINDS.includes(raw.kind as TimelineKind)
    ? (raw.kind as TimelineKind)
    : "milestone";

  return {
    id: cleanText(raw.id, 60),
    yearLabel: cleanText(raw.yearLabel, 40),
    sortYear: Number.isFinite(sortYear) && sortYear > 1800 && sortYear < 2200 ? Math.round(sortYear) : null,
    sortMonth:
      Number.isFinite(sortMonth) && sortMonth >= 1 && sortMonth <= 12
        ? Math.round(sortMonth)
        : null,
    title: cleanText(raw.title, 200),
    kind,
    place: cleanOptionalText(raw.place, 160),
    description: cleanOptionalText(raw.description, 4000),
    linkUrl: cleanUrl(raw.linkUrl),
    mediaId: cleanOptionalText(raw.mediaId, 60),
    status: raw.status === "published" ? "published" : "draft",
    order: Number.isFinite(Number(raw.order)) ? Math.round(Number(raw.order)) : 0,
  };
}

/** Escapes a value for CSV, including Excel's formula-injection guard. */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\n\r]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function toCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const row of rows) {
    lines.push(columns.map((column) => csvCell(row[column])).join(","));
  }
  // BOM so Excel opens UTF-8 accents correctly.
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
