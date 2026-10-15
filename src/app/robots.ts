import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/config";

/**
 * robots.txt for the public site.
 *
 * `/admin` is disallowed rather than merely unlinked: the panel sets `noindex`
 * on itself, but a disallow rule stops crawlers from requesting it at all, so a
 * signed-in administrator's session page is never fetched by a bot. The
 * `noindex` metadata is what matters for anything that gets linked from outside.
 */
export default function robots(): MetadataRoute.Robots {
  const base = siteUrl.replace(/\/$/, "");

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/admin", "/admin/", "/auth/"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
