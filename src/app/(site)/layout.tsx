import { loadSite } from "@/lib/load-content";
import { SiteFooter, SiteHeader } from "@/components/shell";
import { ScrollProgress } from "@/components/effects";

export const metadata = {
  robots: { index: false, follow: false },
};

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // Note: this layout deliberately does NOT read cookies or headers. Doing so
  // would mark every public page as dynamic and throw away the static render +
  // ISR caching that keeps a media-heavy gallery fast. Draft preview is opt-in
  // per request (`?preview=1`) and falls back to published content for anyone
  // without an admin session.
  const site = await loadSite();
  const { siteTitle, tagline } = site.content.meta;

  return (
    <>
      <ScrollProgress />
      <SiteHeader
        siteTitle={siteTitle}
        tagline={tagline}
        socials={site.content.footer.socials}
      />
      <main id="main" className="relative z-10 pt-[68px]">
        {children}
      </main>
      <SiteFooter
        siteTitle={siteTitle}
        note={site.content.footer.note}
        socials={site.content.footer.socials}
        provisional={site.content.provisional}
      />
    </>
  );
}
