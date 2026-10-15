import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Gallery } from "@/components/gallery";
import { PageTransition, Reveal } from "@/components/effects";
import { loadSite } from "@/lib/load-content";
import { resolvePreview } from "@/lib/server/preview";
import { formatBytes } from "@/lib/media";
import type { MediaItem, NftItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  return {
    title: site.content.nfts.title,
    description: site.content.nfts.intro || undefined,
  };
}

/** One piece: image on top, then its own words. */
function NftCard({ item, media }: { item: NftItem; media?: MediaItem }) {
  return (
    <article className="flex flex-col">
      {media ? (
        <Gallery items={[media]} emptyNote="No image for this piece yet." />
      ) : (
        <div className="grid aspect-4/5 place-items-center border border-dashed border-edge">
          <span className="px-6 text-center font-mono text-[0.625rem] tracking-[0.16em] text-bone-faint uppercase">
            Image pending
          </span>
        </div>
      )}

      <div className="mt-5 flex flex-1 flex-col">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h2 className="font-display text-xl tracking-tight">{item.title}</h2>
          {item.year ? (
            <span className="font-mono text-[0.625rem] tracking-[0.14em] text-bone-faint">
              {item.year}
            </span>
          ) : null}
          {item.edition ? <span className="chip chip-draft">{item.edition}</span> : null}
        </div>

        {item.description ? (
          <p className="mt-3 text-sm leading-relaxed text-bone-dim">{item.description}</p>
        ) : null}

        {item.linkUrl ? (
          <a
            href={item.linkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex w-fit items-center gap-1.5 font-mono text-[0.625rem] tracking-[0.16em] text-accent uppercase"
          >
            View on chain <ArrowUpRight size={11} aria-hidden="true" />
          </a>
        ) : null}

        {/* The piece's own weight, when the file is known: useful and honest. */}
        {media?.bytes ? (
          <p className="mt-4 font-mono text-[0.5625rem] tracking-[0.14em] text-bone-faint uppercase">
            {media.kind === "video" ? "Video" : "Image"} · {formatBytes(media.bytes)}
            {media.width && media.height ? ` · ${media.width}×${media.height}` : ""}
          </p>
        ) : null}
      </div>
    </article>
  );
}

export default async function NftsPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = await resolvePreview(params.preview === "1");
  const site = await loadSite({ includeDrafts: preview });
  const { nfts } = site.content;
  const mediaById = new Map(site.siteMedia.map((item) => [item.id, item]));

  const items = nfts.items.filter((item) => item.mediaId || item.title);

  return (
    <PageTransition>
      {preview ? (
        <div className="sticky top-[68px] z-40 border-b border-accent/40 bg-accent/10 px-4 py-2 text-center font-mono text-[0.625rem] tracking-[0.14em] text-accent uppercase backdrop-blur">
          Preview — unpublished changes
        </div>
      ) : null}

      <div className="shell pt-20 pb-10 lg:pt-28">
        <Reveal>
          <p className="eyebrow">{nfts.eyebrow || "NFTs"}</p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="page-title mt-6 max-w-4xl">{nfts.title}</h1>
        </Reveal>
        {nfts.intro ? (
          <Reveal delay={0.1}>
            <p className="mt-7 max-w-2xl text-lg text-bone-dim">{nfts.intro}</p>
          </Reveal>
        ) : null}
      </div>

      <div className="shell pb-24">
        {items.length ? (
          <div className="grid gap-x-8 gap-y-16 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item, index) => (
              <Reveal key={item.id} delay={0.03 * index}>
                <NftCard item={item} media={item.mediaId ? mediaById.get(item.mediaId) : undefined} />
              </Reveal>
            ))}
          </div>
        ) : (
          <p className="border border-dashed border-edge px-6 py-12 text-sm text-bone-faint">
            No pieces published yet. Add them from the admin panel and press Publish.
          </p>
        )}

        {nfts.note ? (
          <Reveal>
            <p className="mt-16 max-w-2xl border-t border-edge pt-6 text-sm leading-relaxed text-bone-faint">
              {nfts.note}
            </p>
          </Reveal>
        ) : null}

        <Reveal>
          <div className="mt-16 flex flex-wrap gap-3">
            <Link href="/works" className="btn">
              See the paintings
              <ArrowUpRight size={14} aria-hidden="true" />
            </Link>
            <Link href="/mint" className="btn">
              Register for the mint
            </Link>
          </div>
        </Reveal>
      </div>
    </PageTransition>
  );
}
