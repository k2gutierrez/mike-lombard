import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { loadSite } from "@/lib/load-content";

export const revalidate = 120;

export default async function NotFound() {
  const site = await loadSite();
  return (
    <div className="shell grid min-h-[70dvh] place-content-center py-24 text-center">
      <p className="eyebrow justify-self-center">404</p>
      <h1 className="mt-6 text-5xl sm:text-6xl">This page is not part of the exhibition</h1>
      <p className="mx-auto mt-6 max-w-md text-bone-dim">
        The work you are looking for may have been unpublished, renamed, or it never existed.
      </p>
      <div className="mt-10 flex flex-wrap justify-center gap-3">
        <Link href="/works" className="btn btn-primary">
          Browse works
        </Link>
        <Link href="/" className="btn">
          <ArrowLeft size={14} aria-hidden="true" /> Back to {site.content.meta.siteTitle}
        </Link>
      </div>
    </div>
  );
}
