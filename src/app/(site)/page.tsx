import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { AmbientField } from "@/components/canvas-field";
import {
  ParallaxMedia,
  PreviewBanner,
  Reveal,
  RevealGroup,
  RevealItem,
} from "@/components/effects";
import { VideoPlayer } from "@/components/media";
import { ProjectCard } from "@/components/project-card";
import { featuredProjects, loadSite } from "@/lib/load-content";
import { resolvePreview } from "@/lib/server/preview";
import { aspectRatio } from "@/lib/media";
import type { MediaItem } from "@/lib/types";

// The landing page is the busiest route and is purged by the publish action, so
// a short ISR window is safe and keeps repeat visits cheap.
export const revalidate = 300;

function findMedia(list: MediaItem[], id: string | null | undefined) {
  if (!id) return undefined;
  return list.find((item) => item.id === id);
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = await resolvePreview(params.preview === "1");
  const site = await loadSite({ includeDrafts: preview });
  const { content, projects, timeline, siteMedia } = site;

  const heroMedia = findMedia(siteMedia, content.hero.mediaId);
  const heroPoster = findMedia(siteMedia, content.hero.posterMediaId) ?? heroMedia;
  const portrait = findMedia(siteMedia, content.bio.portraitMediaId);
  const featured = featuredProjects(site);
  const latestMilestones = timeline.slice(0, 3);
  // `loadSite()` already scopes this to published rows for the public read.
  const published = projects;

  return (
    <>
      {preview ? <PreviewBanner /> : null}
      {/* ---------------------------------------------------------------- hero */}
      <section className="relative isolate overflow-hidden border-b border-edge">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(120%_90%_at_15%_0%,#141719_0%,#08090a_62%)]">
          <AmbientField density={1} />
        </div>

        <div className="shell grid items-center gap-14 pt-16 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pt-24 lg:pb-28">
          <div className="max-w-2xl">
            {content.provisional ? (
              <p className="mb-7 inline-flex items-center gap-2 border border-edge px-3 py-1.5 font-mono text-[0.5625rem] tracking-[0.18em] text-bone-faint uppercase">
                <span className="size-1.5 rounded-full bg-accent" aria-hidden="true" />
                Provisional content · pending artist review
              </p>
            ) : null}

            <Reveal>
              <p className="eyebrow">{content.hero.eyebrow}</p>
            </Reveal>

            <Reveal delay={0.06}>
              <h1 className="mt-6">{content.hero.title}</h1>
            </Reveal>

            <Reveal delay={0.12}>
              <p className="mt-8 max-w-xl text-lg leading-relaxed text-bone-dim">
                {content.hero.subtitle}
              </p>
            </Reveal>

            <Reveal delay={0.18}>
              <div className="mt-11 flex flex-wrap items-center gap-3">
                {content.hero.ctaPrimaryLabel ? (
                  <Link href={content.hero.ctaPrimaryHref} className="btn btn-primary">
                    {content.hero.ctaPrimaryLabel}
                    <ArrowRight size={14} aria-hidden="true" />
                  </Link>
                ) : null}
                {content.hero.ctaSecondaryLabel ? (
                  <Link href={content.hero.ctaSecondaryHref} className="btn">
                    {content.hero.ctaSecondaryLabel}
                  </Link>
                ) : null}
              </div>
            </Reveal>

            <Reveal delay={0.24}>
              <dl className="mt-14 grid max-w-lg grid-cols-2 gap-x-8 gap-y-6 border-t border-edge pt-8 sm:grid-cols-3">
                <div>
                  <dt className="eyebrow">Published works</dt>
                  <dd className="mt-2 font-display text-2xl">
                    {published.length.toString().padStart(2, "0")}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Career entries</dt>
                  <dd className="mt-2 font-display text-2xl">
                    {timeline.length.toString().padStart(2, "0")}
                  </dd>
                </div>
                <div>
                  <dt className="eyebrow">Studio</dt>
                  <dd className="mt-2 font-display text-2xl">Mingles</dd>
                </div>
              </dl>
            </Reveal>
          </div>

          {/* Administrable hero artwork: image or silent looping video. */}
          <Reveal delay={0.1} className="lg:pl-6">
            <div className="relative">
              <div className="absolute -inset-3 -z-10 border border-edge/70" aria-hidden="true" />
              <ParallaxMedia className="overflow-hidden border border-edge bg-pit">
                {heroMedia ? (
                  heroMedia.kind === "video" ? (
                    <VideoPlayer
                      media={heroMedia}
                      autoPlay
                      muted
                      loop
                      interactive={false}
                      className="h-full w-full"
                    />
                  ) : (
                    <div
                      className="relative w-full"
                      style={{ aspectRatio: aspectRatio(heroMedia) }}
                    >
                      <Image
                        src={heroMedia.url ?? ""}
                        alt={heroMedia.alt || `${content.hero.title} — hero artwork`}
                        fill
                        sizes="(max-width: 1024px) 100vw, 46vw"
                        priority
                        className="object-cover"
                      />
                    </div>
                  )
                ) : (
                  <div
                    className="relative grid w-full place-items-center bg-slate-ink"
                    style={{ aspectRatio: "4 / 5" }}
                  >
                    <div className="max-w-[16rem] px-8 text-center">
                      <p className="font-mono text-[0.625rem] tracking-[0.18em] text-bone-faint uppercase">
                        Hero artwork
                      </p>
                      <p className="mt-3 text-sm text-bone-dim">
                        Upload an image or a video in the admin panel and it appears here.
                      </p>
                    </div>
                  </div>
                )}
              </ParallaxMedia>

              {heroPoster && heroMedia?.kind === "video" ? (
                <p className="mt-3 font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
                  Now playing · {heroMedia.alt || "hero film"}
                </p>
              ) : null}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ------------------------------------------------------------ featured */}
      <section className="shell py-24 lg:py-32">
        <div className="flex flex-col justify-between gap-6 border-b border-edge pb-8 md:flex-row md:items-end">
          <div className="max-w-2xl">
            <Reveal>
              <p className="eyebrow">01 — Selection</p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5">{content.featured.title}</h2>
            </Reveal>
            {content.featured.intro ? (
              <Reveal delay={0.1}>
                <p className="mt-5 max-w-xl text-base text-bone-dim">{content.featured.intro}</p>
              </Reveal>
            ) : null}
          </div>
          <Reveal delay={0.1}>
            <Link href="/works" className="btn shrink-0">
              All works
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </Reveal>
        </div>

        {featured.length ? (
          <div className="mt-14 grid gap-10 lg:grid-cols-12 lg:gap-12">
            {featured.map((project, index) => {
              const large = index % 3 === 0;
              return (
                <Reveal
                  key={project.id}
                  delay={0.04 * index}
                  className={large ? "lg:col-span-7" : "lg:col-span-5"}
                >
                  <ProjectCard
                    project={project}
                    index={index}
                    size={large ? "large" : "default"}
                    priority={index === 0}
                  />
                </Reveal>
              );
            })}
          </div>
        ) : (
          <p className="mt-12 border border-dashed border-edge px-6 py-10 text-sm text-bone-faint">
            No projects published yet. Publish one from the admin panel and mark it as featured.
          </p>
        )}
      </section>

      {/* --------------------------------------------------------------- about */}
      <section className="border-y border-edge bg-pit/40">
        <div className="shell grid items-start gap-14 py-24 lg:grid-cols-[0.85fr_1.15fr] lg:py-32">
          <Reveal>
            <div className="relative">
              {portrait ? (
                <div
                  className="relative overflow-hidden border border-edge"
                  style={{ aspectRatio: aspectRatio(portrait) }}
                >
                  <Image
                    src={portrait.url ?? ""}
                    alt={portrait.alt || "Portrait of the artist"}
                    fill
                    sizes="(max-width: 1024px) 100vw, 34vw"
                    className="object-cover"
                  />
                </div>
              ) : (
                <div
                  className="grid place-items-center border border-dashed border-edge"
                  style={{ aspectRatio: "4 / 5" }}
                >
                  <span className="px-8 text-center font-mono text-[0.625rem] tracking-[0.16em] text-bone-faint uppercase">
                    Portrait pending
                  </span>
                </div>
              )}
            </div>
          </Reveal>

          <div className="lg:pt-6">
            <Reveal>
              <p className="eyebrow">02 — The artist</p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5 max-w-xl">{content.bio.title}</h2>
            </Reveal>
            {content.bio.intro ? (
              <Reveal delay={0.1}>
                <p className="mt-6 font-editorial text-2xl leading-snug text-bone italic">
                  {content.bio.intro}
                </p>
              </Reveal>
            ) : null}
            <RevealGroup className="prose-ml mt-8 max-w-2xl">
              {(content.bio.body || "")
                .split("\n\n")
                .filter(Boolean)
                .slice(0, 2)
                .map((paragraph, index) => (
                  <RevealItem key={index}>
                    <p>{paragraph}</p>
                  </RevealItem>
                ))}
            </RevealGroup>
            <Reveal delay={0.15}>
              <Link href="/biography" className="btn btn-ghost mt-8 -ml-2">
                Read the full biography
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </Reveal>
          </div>
        </div>
      </section>

      {/* -------------------------------------------------------------- career */}
      <section className="shell py-24 lg:py-32">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <Reveal>
              <p className="eyebrow">03 — Trajectory</p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5">{content.career.title}</h2>
            </Reveal>
          </div>
          <Reveal delay={0.1}>
            <Link href="/career" className="btn">
              Full timeline
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
          </Reveal>
        </div>

        <div className="mt-14 border-t border-edge">
          {latestMilestones.length ? (
            latestMilestones.map((entry, index) => (
              <Reveal key={entry.id} delay={0.04 * index}>
                <article className="grid gap-4 border-b border-edge py-7 md:grid-cols-[8rem_1fr_auto] md:items-baseline">
                  <span className="font-mono text-xs tracking-[0.16em] text-bone-faint">
                    {entry.yearLabel}
                  </span>
                  <div>
                    <h3 className="font-display text-xl tracking-tight">{entry.title}</h3>
                    {entry.description ? (
                      <p className="mt-2 max-w-2xl text-sm text-bone-dim">{entry.description}</p>
                    ) : null}
                  </div>
                  <span className="font-mono text-[0.5625rem] tracking-[0.18em] text-bone-faint uppercase">
                    {entry.kind}
                  </span>
                </article>
              </Reveal>
            ))
          ) : (
            <p className="py-10 text-sm text-bone-faint">{content.career.emptyNote}</p>
          )}
        </div>
      </section>

      {/* ---------------------------------------------------------------- mint */}
      <section className="relative isolate overflow-hidden border-t border-edge">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(90%_120%_at_85%_10%,#15201d_0%,#08090a_60%)]" />
        <div className="shell grid gap-12 py-24 lg:grid-cols-[1.2fr_0.8fr] lg:py-32">
          <div className="max-w-3xl">
            <Reveal>
              <p className="eyebrow">{content.mint.eyebrow}</p>
            </Reveal>
            <Reveal delay={0.05}>
              <h2 className="mt-5">{content.mint.title}</h2>
            </Reveal>
            {content.mint.intro ? (
              <Reveal delay={0.1}>
                <p className="mt-6 max-w-2xl text-lg text-bone-dim">{content.mint.intro}</p>
              </Reveal>
            ) : null}
            <Reveal delay={0.15}>
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <Link href="/mint" className="btn btn-primary">
                  Register interest
                  <ArrowRight size={14} aria-hidden="true" />
                </Link>
                <span className="font-mono text-[0.625rem] tracking-[0.16em] text-bone-faint uppercase">
                  No payment · no approval · no transaction
                </span>
              </div>
            </Reveal>
          </div>
          <Reveal delay={0.12}>
            <div className="border border-edge bg-pit/50 p-6 lg:p-8">
              <p className="eyebrow">Read this first</p>
              <p className="mt-4 text-sm leading-relaxed text-bone-dim">
                {content.mint.disclaimer}
              </p>
            </div>
          </Reveal>
        </div>
      </section>
    </>
  );
}
