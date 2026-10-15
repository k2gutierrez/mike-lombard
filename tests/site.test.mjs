import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

/**
 * The artist's site must not carry another brand.
 *
 * The Mingles mark, the strapline "Art direction for Mingles" and a hardcoded
 * "Mingles" studio stat were all live on mike-lombard.com before this test
 * existed. The exception is the admin panel (`/admin`), which is internal, and
 * the `ml_` database namespace, which is invisible.
 */
const PUBLIC_FILES = [
  "src/components/shell.tsx",
  "src/components/project-card.tsx",
  "src/components/works-filter.tsx",
  "src/components/gallery.tsx",
  "src/components/media.tsx",
  "src/app/(site)/page.tsx",
  "src/app/(site)/layout.tsx",
  "src/app/(site)/biography/page.tsx",
  "src/app/(site)/career/page.tsx",
  "src/app/(site)/mint/page.tsx",
  "src/app/(site)/nfts/page.tsx",
  "src/app/(site)/works/page.tsx",
  "src/app/(site)/works/[slug]/page.tsx",
  "src/app/layout.tsx",
  "src/app/sitemap.ts",
  "src/app/robots.ts",
];

/**
 * Strips comments so the check looks at what a visitor could actually read.
 * Comments that explain the history ("this used to say X") are not branding.
 */
function codeOnly(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
}

test("no public page or component names another brand", async () => {
  const offenders = [];
  for (const file of PUBLIC_FILES) {
    const source = codeOnly(await readFile(new URL(`../${file}`, import.meta.url), "utf8"));
    source.split("\n").forEach((line, index) => {
      if (/mingles/i.test(line)) offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 90)}`);
    });
  }
  assert.deepEqual(offenders, [], `brand references found:\n${offenders.join("\n")}`);
});

test("the default content does not name another brand either", async () => {
  const source = await readFile(new URL("../src/lib/preview-content.ts", import.meta.url), "utf8");
  // The word may appear in the file's own explanatory comment, never in a string
  // the visitor would read. Strip comments before checking.
  assert.equal(/mingles/i.test(codeOnly(source)), false, "default copy names another brand");
});

test("the site exposes the sections the brief asked for", async () => {
  const shell = await readFile(new URL("../src/components/shell.tsx", import.meta.url), "utf8");
  for (const href of ["/works", "/nfts", "/biography", "/career", "/mint"]) {
    assert.ok(shell.includes(`"${href}"`), `navigation is missing ${href}`);
  }
});
