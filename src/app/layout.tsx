import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/space-grotesk/400.css";
import "@fontsource/space-grotesk/500.css";
import "@fontsource/space-grotesk/600.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/instrument-serif/400.css";
import "@fontsource/instrument-serif/400-italic.css";
import "./globals.css";
import { loadSite } from "@/lib/load-content";
import { siteUrl } from "@/lib/config";
import { coverOf } from "@/lib/media";

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  const { siteTitle, tagline, description, ogMediaId } = site.content.meta;
  const title = tagline ? `${siteTitle} — ${tagline}` : siteTitle;

  /**
   * Image used when the link is shared. `meta.ogMediaId` is chosen in the panel;
   * without it we fall back to the hero, and then to the first published work, so
   * a shared link is never a blank card. Absolute URLs are required by the
   * crawlers that read these tags.
   */
  const heroMedia = site.siteMedia.find((item) => item.id === site.content.hero.mediaId);
  const ogMedia =
    site.siteMedia.find((item) => item.id === ogMediaId) ??
    heroMedia ??
    coverOf(site.projects[0]?.media ?? [], site.projects[0]?.coverMediaId ?? null);

  const ogImage = ogMedia?.url
    ? [{ url: ogMedia.url, alt: ogMedia.alt || siteTitle }]
    : undefined;

  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: `%s — ${siteTitle}` },
    description: description || tagline || `${siteTitle} portfolio`,
    openGraph: {
      title,
      description: description || tagline,
      type: "website",
      siteName: siteTitle,
      url: siteUrl,
      images: ogImage,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: description || tagline,
      images: ogImage?.map((image) => image.url),
    },
    // While the copy is provisional the site stays out of search indexes; the
    // flag is a single switch in the admin panel.
    robots: site.content.provisional
      ? { index: false, follow: false }
      : { index: true, follow: true },
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="noise min-h-dvh antialiased">
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
