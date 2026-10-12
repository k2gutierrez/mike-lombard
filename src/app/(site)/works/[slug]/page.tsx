import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, ArrowUpRight } from "lucide-react";
import { AmbientField } from "@/components/canvas-field";
import { PageTransition, PreviewBanner, Reveal } from "@/components/effects";
import { Gallery } from "@/components/gallery";
import { MediaFrame } from "@/components/media";
import { loadSite } from "@/lib/load-content";
import { coverOf } from "@/lib/media";
import { resolvePreview } from "@/lib/server/preview";
import type { MediaItem, Project } from "@/lib/types";

/**
 * Fully dynamic, on purpose.
 *
 *  * The page serves `?preview=1`, which reads cookies for the administrator
 *    check. Pre-rendering (via `generateStaticParams`) would put the render in a
 *    static context and Next would refuse the cookie read with
 *    DYNAMIC_SERVER_USAGE — a 500 on any slug that was not pre-rendered.
 *  * A pre-rendered work would also go stale: publishing from the panel purges
 *    the cache by tag, but a build-time HTML file would keep serving the old
 *    version until the next deploy.
 */


async function getProject(slug: string, preview = false) {
  const site = await loadSite({ includeDrafts: preview });
  const project = site.projects.find((item) => item.slug === slug) ?? null;
  return { site, project };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { project } = await getProject(slug);
  if (!project) return { title: "Work not found" };
  const cover = coverOf(project.media, project.coverMediaId);
  return {
    title: project.title,
    description: project.excerpt ?? project.description?.slice(0, 200) ?? undefined,
    openGraph: {
      title: project.title,
      description: project.excerpt ?? undefined,
      images: cover?.url ? [{ url: cover.url }] : undefined,
    },
  };
}

export default async function WorkDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}) {
  const [{ slug }, search] = await Promise.all([params, searchParams]);
  const preview = await resolvePreview(search.preview === "1");
  const { site, project } = await getProject(slug, preview);

  if (!project || (!preview && project.status !== "published")) notFound();

  const siblings = site.projects.filter(
    (item) => item.status === "published" && item.id !== project.id,
  );
  const position = siblings.findIndex((item) => item.order > project.order);
  const next =
    position === -1
      ? siblings[0]
      : (siblings[position] ?? siblings[0]);
  const related = siblings
    .filter((item) => item.category === project.category)
    .slice(0, 3);

  const hero = coverOf(project.media, project.coverMediaId);
  const rest: MediaItem[] = hero
    ? project.media.filter((item) => item.id !== hero.id)
    : project.media;

  const facts: Array<[string, string | number | null]> = [
    ["Year", project.year],
    ["Category", project.category],
    ["Client", project.client],
    ["Location", project.location],
  ];

  return (
    <PageTransition>
      {preview ? <PreviewBanner /> : null}
      {/* ------------------------------------------------------------- header */}
      <header className="relative isolate overflow-hidden border-b border-edge">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(100%_80%_at_20%_0%,#12161700_0%,#08090a_70%)]">
          <AmbientField density={0.8} />
        </div>

        <div className="shell pt-14 pb-12 lg:pt-20">
          <Reveal>
            <Link
              href="/works"
              className="eyebrow link-underline inline-flex items-center gap-2"
            >
              <ArrowLeft size={12} aria-hidden="true" /> All works
            </Link>
          </Reveal>

          <div className="mt-10 grid gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-12">
            <div>
              <Reveal delay={0.05}>
                <p className="eyebrow">
                  {project.category}
                  {project.subtitle ? ` — ${project.subtitle}` : ""}
                </p>
              </Reveal>
              <Reveal delay={0.08}>
                <h1 className="page-title mt-5 max-w-3xl">{project.title}</h1>
              </Reveal>
              {project.excerpt ? (
                <Reveal delay={0.12}>
                  <p className="mt-8 max-w-2xl font-editorial text-2xl leading-snug text-bone-dim italic">
                    {project.excerpt}
                  </p>
                </Reveal>
              ) : null}
            </div>

            <Reveal delay={0.14}>
              <dl className="border-t border-edge">
                {facts
                  .filter(([, value]) => value !== null && value !== "")
                  .map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-baseline justify-between gap-6 border-b border-edge py-3"
                    >
                      <dt className="font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
                        {label}
                      </dt>
                      <dd className="text-right text-sm text-bone-dim">{value}</dd>
                    </div>
                  ))}
                {project.externalUrl ? (
                  <a
                    href={project.externalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 inline-flex items-center gap-2 font-mono text-[0.625rem] tracking-[0.16em] text-accent uppercase"
                  >
                    External reference <ArrowUpRight size={12} aria-hidden="true" />
                  </a>
                ) : null}
              </dl>
            </Reveal>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- hero */}
      {hero ? (
        <Reveal className="shell pt-12 lg:pt-16">
          <MediaFrame
            media={hero}
            sizes="100vw"
            priority
            interactive={false}
            className="border border-edge"
          />
          {hero.caption ? (
            <p className="mt-4 max-w-3xl text-sm text-bone-faint">{hero.caption}</p>
          ) : null}
        </Reveal>
      ) : null}

      {/* -------------------------------------------------------------- story */}
      {project.description ? (
        <section className="shell grid gap-10 py-20 lg:grid-cols-[0.4fr_1fr] lg:py-24">
          <Reveal>
            <h2 className="eyebrow">About the work</h2>
          </Reveal>
          <Reveal delay={0.05}>
            <div className="prose-ml max-w-3xl">
              {project.description.split("\n\n").filter(Boolean).map((paragraph, index) => (
                <p key={index}>{paragraph}</p>
              ))}
            </div>
          </Reveal>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ gallery */}
      {rest.length ? (
        <section className="shell pb-24">
          <div className="draw-rule mb-12" />
          <Reveal>
            <h2 className="eyebrow">Gallery</h2>
          </Reveal>
          <div className="mt-8">
            <Gallery items={rest} />
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------------ related */}
      {related.length ? (
        <section className="border-t border-edge">
          <div className="shell py-20">
            <Reveal>
              <h2 className="eyebrow">More in {project.category}</h2>
            </Reveal>
            <ul className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((item, index) => (
                <Reveal as="li" key={item.id} delay={0.05 * index}>
                  <RelatedCard project={item} />
                </Reveal>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      {/* ---------------------------------------------------------------- next */}
      {next ? (
        <section className="border-t border-edge">
          <Link
            href={`/works/${next.slug}`}
            className="group shell flex flex-col gap-4 py-16 sm:flex-row sm:items-center sm:justify-between"
          >
            <div>
              <p className="eyebrow">Next work</p>
              <p className="mt-3 font-display text-3xl tracking-tight transition-colors group-hover:text-accent sm:text-4xl">
                {next.title}
              </p>
            </div>
            <ArrowRight
              size={22}
              aria-hidden="true"
              className="text-bone-faint transition-transform duration-500 group-hover:translate-x-2 group-hover:text-accent"
            />
          </Link>
        </section>
      ) : null}
    </PageTransition>
  );
}

function RelatedCard({ project }: { project: Project }) {
  const cover = coverOf(project.media, project.coverMediaId);
  return (
    <Link href={`/works/${project.slug}`} className="card-hover group block">
      <div className="relative aspect-4/5 overflow-hidden border border-edge bg-pit">
        {cover ? (
          <MediaFrame
            media={cover}
            sizes="(max-width: 640px) 100vw, 33vw"
            interactive={false}
            className="h-full w-full"
          />
        ) : (
          <div className="grid h-full place-items-center">
            <span className="font-mono text-[0.625rem] tracking-[0.16em] text-bone-faint uppercase">
              No cover
            </span>
          </div>
        )}
      </div>
      <h3 className="mt-4 font-display text-lg tracking-tight group-hover:text-accent">
        {project.title}
      </h3>
      <p className="mt-1 font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
        {project.year ?? "—"} · {project.category}
      </p>
    </Link>
  );
}
