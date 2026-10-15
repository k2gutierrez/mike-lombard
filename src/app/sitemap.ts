import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";
import { loadSite } from "@/lib/load-content";

/**
 * Sitemap for the public site.
 *
 * Published works are listed individually; drafts are not, because they are not
 * reachable by an anonymous visitor in the first place. The admin and preview
 * routes are excluded with `robots.txt` rules and the `noindex` metadata those
 * pages set.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = await loadSite();
  const base = siteUrl.replace(/\/$/, "");

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "monthly", priority: 1 },
    { url: `${base}/works`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/nfts`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/biography`, changeFrequency: "yearly", priority: 0.7 },
    { url: `${base}/career`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/mint`, changeFrequency: "monthly", priority: 0.5 },
  ];

  const works: MetadataRoute.Sitemap = site.projects.map((project) => ({
    url: `${base}/works/${project.slug}`,
    lastModified: project.updatedAt ? new Date(project.updatedAt) : undefined,
    changeFrequency: "yearly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...works];
}
