import { loadSite } from "@/lib/load-content";
import { SiteFooter, SiteHeader } from "@/components/shell";
import { ScrollProgress } from "@/components/effects";

/**
 * The public site deliberately sets NO `robots` metadata here.
 *
 * It used to carry a hardcoded `noindex`, which silently overrode the
 * `provisional` switch in the admin panel: unchecking "provisional content"
 * removed the banner but the site stayed out of search indexes. The decision
 * lives in exactly one place now — `generateMetadata()` in the root layout,
 * driven by `content.provisional`.
 */
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
