import type {
  Project,
  SiteContent,
  TimelineEntry,
  MediaItem,
} from "@/lib/types";

/**
 * PROVISIONAL CONTENT — no invented biography, exhibitions or mint details.
 *
 * This document is used when Supabase is not configured (local preview) and as
 * the seed shape for a fresh database. Every string here is deliberately generic
 * and self-labelling: nothing claims to be a verified fact about Mike Lombard.
 * Replace all of it from /admin or by editing `supabase/migrations/*.sql` seed.
 */

export const PREVIEW_MARK = "Provisional content — pending review by the artist.";

export const previewContent: SiteContent = {
  provisional: true,
  meta: {
    siteTitle: "Mike Lombard",
    tagline: "Art direction for Mingles",
    description:
      "Portfolio of Mike Lombard. All text on this preview is provisional and pending the artist's review.",
    ogMediaId: null,
  },
  hero: {
    eyebrow: "Art direction / Mingles",
    title: "Mike Lombard",
    subtitle:
      "Artist and art director behind the new Mingles character era. This hero is administrable: Mike can drop an image or a video here from the panel.",
    ctaPrimaryLabel: "View works",
    ctaPrimaryHref: "/works",
    ctaSecondaryLabel: "Register for the mint",
    ctaSecondaryHref: "/mint",
    mediaId: null,
    posterMediaId: null,
  },
  featured: {
    title: "Selected works",
    intro:
      "Provisional selection. Publish real projects and pick them here to replace these placeholders.",
    projectIds: [],
  },
  works: {
    title: "Works and projects",
    intro: "Browse the catalogue by category.",
    categories: ["illustration", "character", "process", "collaboration"],
  },
  bio: {
    title: "Biography",
    portraitMediaId: null,
    intro: "Provisional text — pending review by the artist.",
    body: "This biography is a placeholder. No verified biography has been supplied yet, so this space is intentionally generic and fully editable from the admin panel.\n\nNothing on this page should be quoted until the artist replaces it with his own words.",
    visionTitle: "Artistic vision",
    vision:
      "Placeholder: describe the visual language, references and process. This text was not written by the artist.",
    minglesTitle: "Relationship with Mingles",
    mingles:
      "Placeholder: explain the role inside Mingles, the Lombard era and how the character system evolved.",
    facts: [],
    socials: [],
  },
  career: {
    title: "Career",
    intro:
      "Provisional timeline. Every entry is editable and must be confirmed before launch.",
    emptyNote: "No verified exhibitions or collaborations have been supplied yet.",
  },
  mint: {
    title: "Mint registration",
    eyebrow: "Register interest",
    intro: "Register your interest in the next Mike Lombard mint.",
    body: "This form registers interest only. It is not a reservation and it does not guarantee an allocation. No payment, no token approval and no transaction is requested anywhere on this site.",
    disclaimer:
      "Registering interest does not guarantee an allocation. Contract, price and date are not defined yet and will be announced when they are real.",
    consentText: "I agree to receive information about this mint by email.",
    open: true,
    closedMessage: "Registration is currently closed.",
  },
  footer: {
    note: "Provisional portfolio.",
    socials: [],
  },
  updatedAt: new Date(0).toISOString(),
};

export const previewProjects: Project[] = [
  {
    id: "preview-1",
    slug: "placeholder-lombard-era",
    title: "Lombard era — provisional",
    subtitle: "Character study",
    year: null,
    category: "character",
    excerpt: "Provisional placeholder project. Replace with a real work.",
    description:
      "Placeholder work created during setup so the gallery and the admin panel have something to show. Delete it from /admin and add real projects with real images.",
    client: null,
    location: null,
    externalUrl: null,
    status: "published",
    order: 10,
    featured: true,
    featuredRank: 1,
    publishedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    coverMediaId: null,
    media: [],
  },
  {
    id: "preview-2",
    slug: "placeholder-sketchbook",
    title: "Sketchbook — provisional",
    subtitle: "Process",
    year: null,
    category: "process",
    excerpt: "Provisional placeholder for process material.",
    description:
      "Placeholder for sketches, process shots and studio material. Not a real work by the artist until he says so.",
    client: null,
    location: null,
    externalUrl: null,
    status: "published",
    order: 20,
    featured: false,
    featuredRank: null,
    publishedAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    coverMediaId: null,
    media: [],
  },
];

export const previewTimeline: TimelineEntry[] = [
  {
    id: "preview-t1",
    yearLabel: "2026",
    sortYear: 2026,
    sortMonth: null,
    title: "Mingles — new art direction (provisional)",
    kind: "collaboration",
    place: null,
    description:
      "Placeholder milestone. Confirm details with the artist before publishing.",
    linkUrl: null,
    mediaId: null,
    status: "published",
    order: 10,
  },
  {
    id: "preview-t2",
    yearLabel: "—",
    sortYear: null,
    sortMonth: null,
    title: "Add exhibitions, collaborations and milestones",
    kind: "milestone",
    place: null,
    description:
      "Every entry in this line is written by the artist. Nothing here is invented by the site.",
    linkUrl: null,
    mediaId: null,
    status: "published",
    order: 20,
  },
];

export const previewMedia: MediaItem[] = [];
