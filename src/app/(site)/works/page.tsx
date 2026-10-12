import type { Metadata } from "next";
import { PageTransition, PreviewBanner, Reveal } from "@/components/effects";
import { WorksFilter } from "@/components/works-filter";
import { categoriesOf, loadSite } from "@/lib/load-content";
import { resolvePreview } from "@/lib/server/preview";

export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  return {
    title: site.content.works.title,
    description: site.content.works.intro || undefined,
  };
}

export default async function WorksPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string; preview?: string }>;
}) {
  const params = await searchParams;
  const preview = await resolvePreview(params.preview === "1");
  const site = await loadSite({ includeDrafts: preview });
  const projects = site.projects.filter((project) => project.status === "published");
  const categories = categoriesOf(site);
  const initial =
    params.category && (categories.includes(params.category) || params.category === "all")
      ? params.category
      : "all";

  return (
    <PageTransition>
      {preview ? <PreviewBanner /> : null}
      <div className="shell pt-20 pb-10 lg:pt-28">
        <Reveal>
          <p className="eyebrow">Works and projects</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="page-title mt-6 max-w-4xl">{site.content.works.title}</h1>
        </Reveal>
        {site.content.works.intro ? (
          <Reveal delay={0.1}>
            <p className="mt-7 max-w-2xl text-lg text-bone-dim">{site.content.works.intro}</p>
          </Reveal>
        ) : null}
      </div>

      <div className="shell pb-24">
        <Reveal delay={0.12}>
          <WorksFilter
            projects={projects}
            categories={categories.filter(
              (category) => category !== "all" && category.trim().length > 0,
            )}
            initialCategory={initial}
          />
        </Reveal>
      </div>
    </PageTransition>
  );
}
