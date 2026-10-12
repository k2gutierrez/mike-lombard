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

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  const { siteTitle, tagline, description } = site.content.meta;
  const title = tagline ? `${siteTitle} — ${tagline}` : siteTitle;

  return {
    metadataBase: new URL(siteUrl),
    title: { default: title, template: `%s — ${siteTitle}` },
    description: description || tagline || `${siteTitle} portfolio`,
    openGraph: {
      title,
      description: description || tagline,
      type: "website",
      siteName: siteTitle,
    },
    twitter: { card: "summary_large_image", title, description },
    // Provisional copy while the site is not approved: keep it out of search.
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
