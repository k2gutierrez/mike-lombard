import { ArrowUpRight } from "lucide-react";
import { PageTransition, PreviewBanner, Reveal } from "@/components/effects";
import { loadSite } from "@/lib/load-content";
import { resolvePreview } from "@/lib/server/preview";

// Note: no `revalidate` here on purpose. This route reads `searchParams`
// (`?preview=1`), and a route-level cache could hand a non-preview render to an
// administrator — or a preview render to a visitor. The response is generated
// per request and the cache is purged by the publish action instead.

const KIND_LABEL: Record<string, string> = {
  exhibition: "Exhibition",
  collaboration: "Collaboration",
  milestone: "Milestone",
  press: "Press",
  residency: "Residency",
};

export default async function CareerPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = await resolvePreview(params.preview === "1");
  const site = await loadSite({ includeDrafts: preview });
  const { content, timeline } = site;

  // Group by the year label the artist typed; ordering follows the admin list.
  const groups = new Map<string, typeof timeline>();
  for (const entry of timeline) {
    const key = entry.yearLabel || "—";
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  return (
    <PageTransition>
      {preview ? <PreviewBanner /> : null}
      <div className="shell pt-20 pb-10 lg:pt-28">
        <Reveal>
          <p className="eyebrow">Trajectory</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="page-title mt-6 max-w-3xl">{content.career.title}</h1>
        </Reveal>
        {content.career.intro ? (
          <Reveal delay={0.1}>
            <p className="mt-7 max-w-2xl text-lg text-bone-dim">{content.career.intro}</p>
          </Reveal>
        ) : null}
        {content.provisional ? (
          <Reveal delay={0.12}>
            <p className="mt-8 inline-flex border border-edge px-4 py-3 font-mono text-[0.625rem] tracking-wide text-bone-faint uppercase">
              Provisional timeline — entries must be confirmed by the artist
            </p>
          </Reveal>
        ) : null}
      </div>

      <div className="shell pb-24">
        {timeline.length ? (
          <div className="mt-10 border-t border-edge">
            {[...groups.entries()].map(([year, entries], groupIndex) => (
              <section
                key={year}
                className="grid gap-6 border-b border-edge py-10 md:grid-cols-[10rem_1fr] md:gap-12"
              >
                <Reveal delay={0.02 * groupIndex}>
                  <h2 className="font-display text-3xl tracking-tight text-bone md:sticky md:top-28">
                    {year}
                  </h2>
                </Reveal>

                <ol className="flex flex-col">
                  {entries.map((entry, index) => (
                    <Reveal as="li" key={entry.id} delay={0.04 * index}>
                      <article className="group grid gap-3 border-b border-edge/60 py-6 last:border-0 sm:grid-cols-[1fr_auto] sm:items-baseline">
                        <div>
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            <h3 className="font-display text-xl tracking-tight">{entry.title}</h3>
                            <span className="chip chip-draft">{KIND_LABEL[entry.kind] ?? entry.kind}</span>
                          </div>
                          {entry.place ? (
                            <p className="mt-2 font-mono text-[0.625rem] tracking-[0.16em] text-bone-faint uppercase">
                              {entry.place}
                            </p>
                          ) : null}
                          {entry.description ? (
                            <p className="mt-3 max-w-2xl text-sm text-bone-dim">
                              {entry.description}
                            </p>
                          ) : null}
                          {entry.linkUrl ? (
                            <a
                              href={entry.linkUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-3 inline-flex items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.16em] text-accent uppercase"
                            >
                              Reference <ArrowUpRight size={11} aria-hidden="true" />
                            </a>
                          ) : null}
                        </div>
                      </article>
                    </Reveal>
                  ))}
                </ol>
              </section>
            ))}
          </div>
        ) : (
          <p className="mt-10 border border-dashed border-edge px-6 py-12 text-sm text-bone-faint">
            {content.career.emptyNote}
          </p>
        )}
      </div>
    </PageTransition>
  );
}
