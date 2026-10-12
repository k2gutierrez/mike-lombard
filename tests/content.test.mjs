import test from "node:test";
import assert from "node:assert/strict";
import {
  cleanHref,
  cleanText,
  cleanUrl,
  looksLikeSpam,
  normalizeEmail,
  normalizeEvmAddress,
  slugify,
  validateEmail,
} from "../src/lib/validation.ts";
import { csvCell, sanitizeProject, sanitizeSiteContent, sanitizeTimeline, toCsv } from "../src/lib/sanitize.ts";
import { validateUpload } from "../src/lib/server/files.ts";
import { extensionFor, posterSrc, withPosterFragment } from "../src/lib/media.ts";
import { POSTER_TIME } from "../src/lib/admin-client.ts";

test("email rules", () => {
  assert.equal(normalizeEmail("  Mike@Studio.COM "), "mike@studio.com");
  assert.equal(validateEmail("mike@studio.com"), null);
  assert.match(validateEmail("mike@studio"), /valid/);
  assert.match(validateEmail("mike@@studio.com"), /valid/);
  assert.match(validateEmail(""), /Enter/);
  assert.match(validateEmail("mike@studio..com"), /valid/);
  assert.equal(validateEmail(`${"a".repeat(60)}@studio.com`), null);
  assert.match(validateEmail(`${"a".repeat(70)}@studio.com`), /too long/);
});

test("EVM address rules: checksum respected, ownership never implied", () => {
  const lower = "0x64ee17941bdbd570d4c1d9c584ce6858b53e0e7a";
  const parsed = normalizeEvmAddress(lower);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.address, lower, "normalises to lowercase");

  const bad = normalizeEvmAddress("0x64EE17941bdbd570d4c1d9c584ce6858b53e0e7a");
  assert.equal(bad.ok, false, "mixed case with a wrong checksum is rejected");

  assert.equal(normalizeEvmAddress("0x123").ok, false);
  assert.equal(normalizeEvmAddress("64ee17941bdbd570d4c1d9c584ce6858b53e0e7a").ok, false);
  assert.equal(normalizeEvmAddress("").ok, false);
});

test("spam heuristics", () => {
  assert.ok(looksLikeSpam({ honeypot: "http://spam" }));
  assert.ok(looksLikeSpam({ elapsedMs: 300 }));
  assert.ok(looksLikeSpam({ email: "aaaaaaaaaa@b.com" }));
  assert.equal(looksLikeSpam({ elapsedMs: 5000, email: "mike@studio.com" }), null);
});

test("text and URL hardening", () => {
  assert.equal(cleanText("  hi\n\nthere  ", 100), "hi\n\nthere");
  assert.equal(cleanText("x".repeat(300), 10).length, 10);
  assert.equal(cleanText(undefined), "");
  assert.equal(cleanUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(cleanUrl("javascript:alert(1)"), null);
  assert.equal(cleanUrl("data:text/html,x"), null);
  assert.equal(cleanUrl("not a url"), null);
  assert.equal(cleanHref("javascript:alert(1)", "/works"), "/works");
  assert.equal(cleanHref("/career", "/"), "/career");
  assert.equal(cleanHref("//evil.example", "/"), "/");
  assert.equal(cleanHref("https://instagram.com/x", "/"), "https://instagram.com/x");
});

test("slugify matches the SQL helper", () => {
  assert.equal(slugify("Héllo  World--2026!"), "hello-world-2026");
  assert.equal(slugify("  Lombard Era  "), "lombard-era");
  assert.equal(slugify(""), "");
});

test("site content sanitiser keeps the shape and drops junk", () => {
  const content = sanitizeSiteContent({
    provisional: false,
    meta: { siteTitle: "Mike Lombard", description: "x".repeat(900) },
    hero: { title: "Mike", ctaPrimaryHref: "javascript:alert(1)", mediaId: "abc" },
    featured: { projectIds: ["a", "b", 42, null, "c"] },
    bio: {
      facts: [
        { label: "Based in", value: "Nowhere" },
        { label: "", value: "drop me" },
        { label: "Drop", value: "" },
      ],
      socials: [
        { label: "Instagram", href: "https://instagram.com/x" },
        { label: "Evil", href: "javascript:alert(1)" },
      ],
    },
    mint: { open: false },
  });

  assert.equal(content.provisional, false);
  assert.equal(content.meta.description.length, 320, "description is capped");
  assert.equal(content.hero.ctaPrimaryHref, "/works", "unsafe href falls back to /works");
  assert.deepEqual(content.featured.projectIds, ["a", "b", "c"]);
  assert.deepEqual(content.bio.facts, [{ label: "Based in", value: "Nowhere" }]);
  assert.deepEqual(content.bio.socials, [
    { label: "Instagram", href: "https://instagram.com/x" },
  ]);
  // Unknown/blank fields fall back to the provisional defaults instead of "".
  assert.ok(content.career.emptyNote.length > 0);
  assert.equal(content.mint.consentText.length > 0, true);
});

test("project and timeline sanitisers clamp values", () => {
  const project = sanitizeProject({
    title: "  Series No. 1 ",
    slug: "series-no-1",
    year: "1999",
    category: "Illustration",
    status: "published",
    featured: "yes",
    externalUrl: "http://example.com/x",
  });
  assert.equal(project.title, "Series No. 1");
  assert.equal(project.year, 1999);
  assert.equal(project.category, "illustration");
  assert.equal(project.status, "published");
  assert.equal(project.featured, false, "only strict true counts");
  assert.equal(project.externalUrl, "http://example.com/x");

  const weird = sanitizeProject({ year: 12000, status: "nope" });
  assert.equal(weird.year, null);
  assert.equal(weird.status, "draft");

  const entry = sanitizeTimeline({ title: "Show", kind: "hack", sortMonth: 44, yearLabel: "2026" });
  assert.equal(entry.kind, "milestone");
  assert.equal(entry.sortMonth, null);
});

test("CSV export escapes quotes, newlines and spreadsheet formulas", () => {
  assert.equal(csvCell('a"b'), '"a""b"');
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell("=cmd()"), "'=cmd()", "formula injection is neutralised");
  const csv = toCsv([{ email: "a@b.com", wallet_address: "" }], ["email", "wallet_address"]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("email,wallet_address"));
  assert.ok(csv.includes("a@b.com,"));
});

test("upload validation sniffs real bytes", async () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  // The worst case for a magic-byte sniffer: a real JPEG header immediately
  // followed by an ISO-BMFF `ftyp` box. Both signatures are true, so the
  // decision has to come from the leading bytes.
  const jpeg = new Uint8Array([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d, 0x00, 0x01,
  ]);
  const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);

  const okPng = await validateUpload({ head: png, declaredMime: "image/png", size: 4096, expect: "image" });
  assert.equal(okPng.ok, true);

  // Declared MIME is not trusted: the real bytes win, and the stored MIME is the
  // sniffed one. A JPEG announced as a PNG is accepted *as a JPEG*.
  const disguised = await validateUpload({ head: jpeg, declaredMime: "image/png", size: 4096, expect: "image" });
  assert.equal(disguised.ok, true);
  assert.equal(disguised.file.mime, "image/jpeg", "the sniffed MIME is stored, not the declared one");

  // A PNG announced as a video is refused outright.
  const swapped = await validateUpload({ head: png, declaredMime: "video/mp4", size: 4096, expect: "video" });
  assert.equal(swapped.ok, false);

  // Random bytes with no recognisable signature are refused.
  const noSignature = await validateUpload({
    head: new Uint8Array(16).fill(0x41),
    declaredMime: "image/png",
    size: 4096,
    expect: "image",
  });
  assert.equal(noSignature.ok, false);

  const wrongKind = await validateUpload({ head: png, declaredMime: "image/png", size: 4096, expect: "video" });
  assert.equal(wrongKind.ok, false);

  const tooBig = await validateUpload({
    head: png,
    declaredMime: "image/png",
    size: 21 * 1024 * 1024,
    expect: "image",
  });
  assert.equal(tooBig.ok, false);

  const video = await validateUpload({ head: mp4, declaredMime: "video/mp4", size: 50 * 1024 * 1024, expect: "video" });
  assert.equal(video.ok, true);

  const junk = await validateUpload({
    head: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]),
    declaredMime: "image/png",
    size: 4096,
    expect: "image",
  });
  assert.equal(junk.ok, false);
});

test("media helpers", () => {
  assert.equal(extensionFor("image/jpeg"), "jpg");
  assert.equal(extensionFor("video/quicktime"), "mov");
  assert.equal(extensionFor("application/x-weird", "clip.MKV"), "mkv");
  assert.equal(withPosterFragment("https://x/y.mp4", 2.5), "https://x/y.mp4#t=2.50");
  assert.equal(withPosterFragment("https://x/y.mp4", null), "https://x/y.mp4");

  const image = {
    id: "1", projectId: null, scope: "site", kind: "image", bucket: "ml-media",
    path: "a.jpg", posterPath: null, posterTime: null, alt: "a", caption: null,
    year: null, width: 100, height: 100, durationS: null, bytes: null, mime: null,
    order: 0, url: "https://x/a.jpg", posterUrl: null,
  };
  assert.equal(posterSrc(image), null);

  const video = {
    ...image, kind: "video", posterTime: POSTER_TIME, url: "https://x/v.mp4",
  };
  assert.equal(posterSrc(video), `https://x/v.mp4#t=${POSTER_TIME.toFixed(2)}`);
  assert.equal(
    posterSrc({ ...video, posterUrl: "https://x/poster.webp" }),
    "https://x/poster.webp",
    "an uploaded poster wins over the fragment",
  );
});
