import type { Metadata } from "next";
import { BadgeCheck, CalendarClock, FileText, Mail, ShieldAlert, Wallet } from "lucide-react";
import { PageTransition, PreviewBanner, Reveal } from "@/components/effects";
import { MintForm } from "@/components/mint/mint-form";
import { loadSite } from "@/lib/load-content";
import { resolvePreview } from "@/lib/server/preview";

export const revalidate = 120;

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  return {
    title: site.content.mint.title,
    description: site.content.mint.intro || undefined,
  };
}

const STEPS = [
  {
    icon: Mail,
    title: "Email",
    body: "So we can tell you when the mint actually happens. Nothing else is sent to this address.",
  },
  {
    icon: Wallet,
    title: "Wallet address",
    body: "Optional. Paste an EVM address or fill it from a connected wallet. It is not proof of ownership.",
  },
  {
    icon: BadgeCheck,
    title: "Explicit consent",
    body: "You tick the consent box yourself. The date and the exact text you accepted are stored.",
  },
];

export default async function MintPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const params = await searchParams;
  const preview = await resolvePreview(params.preview === "1");
  const site = await loadSite({ includeDrafts: preview });
  const { mint } = site.content;

  return (
    <PageTransition>
      {preview ? <PreviewBanner /> : null}
      <div className="shell pt-20 pb-24 lg:pt-28">
        <div className="max-w-3xl">
          <Reveal>
            <p className="eyebrow">{mint.eyebrow}</p>
          </Reveal>
          <Reveal delay={0.05}>
            <h1 className="page-title mt-6">{mint.title}</h1>
          </Reveal>
          {mint.intro ? (
            <Reveal delay={0.1}>
              <p className="mt-8 text-lg leading-relaxed text-bone-dim">{mint.intro}</p>
            </Reveal>
          ) : null}
        </div>

        <div className="mt-14 grid gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <Reveal delay={0.08}>
            <div>
              <div className="border border-alert/30 bg-alert/5 p-5 sm:p-6">
                <p className="flex items-start gap-3 text-sm leading-relaxed text-bone">
                  <ShieldAlert size={16} className="mt-0.5 shrink-0 text-alert" aria-hidden="true" />
                  <span>{mint.disclaimer}</span>
                </p>
              </div>

              {mint.body ? (
                <div className="prose-ml mt-10 max-w-2xl">
                  {mint.body.split("\n\n").filter(Boolean).map((paragraph, index) => (
                    <p key={index}>{paragraph}</p>
                  ))}
                </div>
              ) : null}

              <ol className="mt-12 border-t border-edge">
                {STEPS.map((step, index) => (
                  <li
                    key={step.title}
                    className="grid gap-4 border-b border-edge py-6 sm:grid-cols-[2.5rem_1fr]"
                  >
                    <span className="grid size-9 place-items-center border border-edge text-bone-faint">
                      <step.icon size={14} aria-hidden="true" />
                    </span>
                    <div>
                      <h2 className="font-display text-lg tracking-tight">
                        {index + 1}. {step.title}
                      </h2>
                      <p className="mt-2 max-w-xl text-sm text-bone-dim">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-10 grid gap-4 sm:grid-cols-2">
                <div className="border border-edge p-5">
                  <p className="flex items-center gap-2 font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
                    <CalendarClock size={12} aria-hidden="true" /> Date
                  </p>
                  <p className="mt-3 text-sm text-bone-dim">
                    Not defined. It will be announced only when it is real.
                  </p>
                </div>
                <div className="border border-edge p-5">
                  <p className="flex items-center gap-2 font-mono text-[0.5625rem] tracking-[0.16em] text-bone-faint uppercase">
                    <FileText size={12} aria-hidden="true" /> Contract &amp; price
                  </p>
                  <p className="mt-3 text-sm text-bone-dim">
                    Not published. No contract address, no price and no allocation is promised here.
                  </p>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="lg:sticky lg:top-28">
              <MintForm mint={mint} />
            </div>
          </Reveal>
        </div>
      </div>
    </PageTransition>
  );
}
