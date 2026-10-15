"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X, Instagram, Twitter, Globe, ArrowUpRight, LogIn } from "lucide-react";
import type { SocialLink } from "@/lib/types";
import { prefersReducedMotion } from "@/lib/use-reduced-motion";

const NAV = [
  { href: "/", label: "Index" },
  { href: "/works", label: "Works" },
  { href: "/nfts", label: "NFTs" },
  { href: "/biography", label: "Biography" },
  { href: "/career", label: "Career" },
  { href: "/mint", label: "Mint" },
];

function SocialIcon({ href }: { href: string }) {
  const host = (() => {
    try {
      return new URL(href).hostname.replace("www.", "");
    } catch {
      return "";
    }
  })();
  if (host.includes("instagram")) return <Instagram size={14} aria-hidden="true" />;
  if (host.includes("twitter") || host.includes("x.com")) return <Twitter size={14} aria-hidden="true" />;
  return <Globe size={14} aria-hidden="true" />;
}

export function SiteHeader({
  siteTitle,
  tagline,
  socials = [],
}: {
  siteTitle: string;
  tagline?: string;
  socials?: SocialLink[];
}) {
  const pathname = usePathname();
  const reduced = prefersReducedMotion();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-colors duration-500 ${
        scrolled || open
          ? "border-b border-edge/80 bg-void/85 backdrop-blur-md"
          : "border-b border-transparent"
      }`}
    >
      <div className="shell flex h-[68px] items-center justify-between gap-6">
        <Link href="/" className="group flex items-center gap-3" aria-label={`${siteTitle} — home`}>
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center border border-edge font-mono text-[0.5625rem] tracking-[0.06em] text-bone-dim transition-colors group-hover:border-accent group-hover:text-accent"
          >
            ML
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-display text-[0.9rem] font-medium tracking-tight">
              {siteTitle}
            </span>
            {tagline ? (
              <span className="mt-[3px] hidden font-mono text-[0.5rem] tracking-[0.2em] text-bone-faint uppercase sm:block">
                {tagline}
              </span>
            ) : null}
          </span>
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-8 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              data-active={isActive(item.href)}
              className="link-underline font-mono text-[0.6875rem] tracking-[0.18em] text-bone-dim uppercase transition-colors hover:text-bone data-[active=true]:text-bone"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-3 lg:flex">
            {socials.slice(0, 3).map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={social.label}
                className="text-bone-faint transition-colors hover:text-bone"
              >
                <SocialIcon href={social.href} />
              </a>
            ))}
          </div>

          <Link
            href="/mint"
            className="hidden border border-edge-soft px-4 py-2.5 font-mono text-[0.625rem] tracking-[0.16em] text-bone uppercase transition-colors hover:border-bone hover:bg-bone hover:text-void sm:inline-flex"
          >
            Register interest
          </Link>

          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            aria-expanded={open}
            aria-controls="mobile-nav"
            aria-label={open ? "Close menu" : "Open menu"}
            className="grid size-10 place-items-center border border-edge text-bone md:hidden"
          >
            {open ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {open ? (
          <motion.div
            id="mobile-nav"
            initial={reduced ? undefined : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="border-t border-edge bg-void/97 backdrop-blur-md md:hidden"
          >
            <nav aria-label="Main" className="shell flex flex-col py-4">
              {NAV.map((item, index) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-baseline justify-between border-b border-edge/60 py-4 font-display text-3xl tracking-tight text-bone"
                >
                  <span>{item.label}</span>
                  <span className="font-mono text-[0.625rem] text-bone-faint">
                    0{index + 1}
                  </span>
                </Link>
              ))}
              <Link
                href="/mint"
                className="mt-6 inline-flex items-center justify-center gap-2 border border-bone bg-bone px-5 py-4 font-mono text-[0.6875rem] tracking-[0.16em] text-void uppercase"
              >
                Register interest <ArrowUpRight size={14} aria-hidden="true" />
              </Link>
              <Link
                href="/admin"
                className="mt-3 inline-flex items-center justify-center gap-2 border border-edge px-5 py-3 font-mono text-[0.625rem] tracking-[0.16em] text-bone-dim uppercase"
              >
                <LogIn size={13} aria-hidden="true" /> Studio login
              </Link>
            </nav>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}

export function SiteFooter({
  siteTitle,
  note,
  socials = [],
  provisional = true,
  adminEmail = null,
}: {
  siteTitle: string;
  note?: string;
  socials?: SocialLink[];
  provisional?: boolean;
  adminEmail?: string | null;
}) {
  return (
    <footer className="relative z-10 mt-32 border-t border-edge">
      <div className="shell grid gap-12 py-16 md:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <p className="font-display text-2xl tracking-tight">{siteTitle}</p>
          {note ? <p className="mt-4 text-sm text-bone-dim">{note}</p> : null}
          {provisional ? (
            <p className="mt-4 font-mono text-[0.625rem] leading-relaxed tracking-wide text-bone-faint uppercase">
              Provisional content — pending review by the artist
            </p>
          ) : null}
        </div>

        <nav aria-label="Sections" className="flex flex-col gap-3">
          <span className="eyebrow">Sections</span>
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="w-fit text-sm text-bone-dim transition-colors hover:text-bone"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex flex-col gap-3">
          <span className="eyebrow">Elsewhere</span>
          {socials.length ? (
            socials.map((social) => (
              <a
                key={social.href}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer me"
                className="flex w-fit items-center gap-2 text-sm text-bone-dim transition-colors hover:text-bone"
              >
                <SocialIcon href={social.href} />
                {social.label}
              </a>
            ))
          ) : (
            <p className="text-sm text-bone-faint">
              Add social links from the admin panel.
            </p>
          )}
          <Link
            href="/admin"
            className="mt-2 inline-flex w-fit items-center gap-2 border border-edge px-3 py-2 font-mono text-[0.625rem] tracking-[0.16em] text-bone-dim uppercase transition-colors hover:border-bone hover:text-bone"
          >
            <LogIn size={12} aria-hidden="true" />
            {adminEmail ? "Content studio" : "Studio login"}
          </Link>
          <p className="mt-2 max-w-[15rem] text-xs leading-relaxed text-bone-faint">
            For the artist and site administrators.
          </p>
        </div>
      </div>
      <div className="shell flex flex-col gap-2 border-t border-edge py-6 font-mono text-[0.625rem] tracking-[0.14em] text-bone-faint uppercase sm:flex-row sm:items-center sm:justify-between">
        <span>© {new Date().getFullYear()} {siteTitle}</span>
      </div>
    </footer>
  );
}
