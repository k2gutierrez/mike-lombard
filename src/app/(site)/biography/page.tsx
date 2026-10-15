import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { MediaFrame } from "@/components/media";
import { loadSite } from "@/lib/load-content";
import { PageTransition, PreviewBanner, Reveal } from "@/components/effects";
import { resolvePreview } from "@/lib/server/preview";

// Note: no `revalidate` here on purpose. This route reads `searchParams`
// (`?preview=1`), and a route-level cache could hand a non-preview render to an
// administrator — or a preview render to a visitor. The response is generated
// per request and the cache is purged by the publish action instead.

export default async function BiographyPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = await resolvePreview(params.preview === "1");
  const site = await loadSite({ includeDrafts: preview });
  const { content, siteMedia } = site;
  /**
   * Two images on purpose: one of his works and a photo of the artist himself.
   * The request was explicit — the page should show the painting *and* the
   * person behind it. Falls back gracefully when only one (or neither) is set.
   */
  const artwork = content.bio.artworkMediaId
    ? siteMedia.find((item) => item.id === content.bio.artworkMediaId)
    : undefined;
  const portrait = content.bio.portraitMediaId
    ? siteMedia.find((item) => item.id === content.bio.portraitMediaId)
    : undefined;

  const paragraphs = (content.bio.body || "").split("\n\n").filter(Boolean);

  return (
    <PageTransition>
      {preview ? <PreviewBanner /> : null}
      <div className="shell pt-20 pb-8 lg:pt-28">
        <Reveal>
          <p className="eyebrow">Biography</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="page-title mt-6 max-w-4xl">{content.bio.title}</h1>
        </Reveal>
        {content.provisional ? (
          <Reveal delay={0.1}>
            <p className="mt-8 inline-flex max-w-2xl border border-edge px-4 py-3 font-mono text-[0.625rem] leading-relaxed tracking-wide text-bone-faint uppercase">
              Provisional text — pending review by the artist
            </p>
          </Reveal>
        ) : null}
      </div>

      <div className="shell grid gap-16 pt-14 pb-24 lg:grid-cols-[0.8fr_1.2fr] lg:gap-20 lg:pt-20">
        <div>
          <Reveal>
            <div className="lg:sticky lg:top-28">
              {artwork ? (
                <figure>
                  <MediaFrame
                    media={artwork}
                    sizes="(max-width: 1024px) 100vw, 32vw"
                    priority
                    interactive={false}
                    className="border border-edge"
                  />
                  <figcaption className="mt-3 font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
                    {artwork.caption || artwork.alt}
                  </figcaption>
                </figure>
              ) : null}

              {portrait ? (
                <figure className={artwork ? "mt-6" : undefined}>
                  <MediaFrame
                    media={portrait}
                    sizes="(max-width: 1024px) 100vw, 32vw"
                    priority={!artwork}
                    interactive={false}
                    className="border border-edge"
                  />
                  <figcaption className="mt-3 font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
                    The artist
                  </figcaption>
                </figure>
              ) : null}

              {!portrait && !artwork ? (
                <div
                  className="grid place-items-center border border-dashed border-edge"
                  style={{ aspectRatio: "4 / 5" }}
                >
                  <span className="px-8 text-center font-mono text-[0.625rem] tracking-[0.16em] text-bone-faint uppercase">
                    Portrait pending
                  </span>
                </div>
              ) : null}

              {content.bio.facts.length ? (
                <dl className="mt-8 border-t border-edge">
                  {content.bio.facts.map((fact) => (
                    <div
                      key={fact.label}
                      className="flex items-baseline justify-between gap-6 border-b border-edge py-3"
                    >
                      <dt className="font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
                        {fact.label}
                      </dt>
                      <dd className="text-right text-sm text-bone-dim">{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}

              {content.bio.socials.length ? (
                <div className="mt-8 flex flex-wrap gap-3">
                  {content.bio.socials.map((social) => (
                    <a
                      key={social.href}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer me"
                      className="chip transition-colors hover:border-bone hover:text-bone"
                    >
                      {social.label}
                      <ArrowUpRight size={11} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          </Reveal>
        </div>

        <div>
          {content.bio.intro ? (
            <Reveal>
              <p className="font-editorial text-3xl leading-tight text-bone italic">
                {content.bio.intro}
              </p>
            </Reveal>
          ) : null}

          <div className="prose-ml mt-10 max-w-2xl">
            {paragraphs.map((paragraph, index) => (
              <Reveal key={index} delay={0.03 * index}>
                <p>{paragraph}</p>
              </Reveal>
            ))}
          </div>

          <div className="mt-20 grid gap-14 border-t border-edge pt-14 md:grid-cols-2">
            <Reveal>
              <h2 className="font-display text-2xl tracking-tight">{content.bio.visionTitle}</h2>
              <p className="prose-ml mt-5">{content.bio.vision}</p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="font-display text-2xl tracking-tight">
                {content.bio.collabTitle}
              </h2>
              <p className="prose-ml mt-5">{content.bio.collab}</p>
              <Link href="/works" className="btn mt-8">
                See the works
                <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
            </Reveal>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
